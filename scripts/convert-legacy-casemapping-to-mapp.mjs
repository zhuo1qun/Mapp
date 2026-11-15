import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'acorn';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error('Usage: node scripts/convert-legacy-casemapping-to-mapp.mjs <input.html> <output.json>');
}

const html = fs.readFileSync(inputPath, 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
const source = scripts.join('\n');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
const values = new Map();

function literal(node) {
  if (!node) return undefined;
  switch (node.type) {
    case 'Literal':
      return node.value;
    case 'ArrayExpression':
      return node.elements.map(literal);
    case 'ObjectExpression': {
      const result = {};
      for (const property of node.properties) {
        if (property.type !== 'Property' || property.kind !== 'init') {
          throw new Error(`Unsupported object member: ${property.type}`);
        }
        const key = property.computed ? literal(property.key) : property.key.name ?? property.key.value;
        result[key] = literal(property.value);
      }
      return result;
    }
    case 'UnaryExpression': {
      const value = literal(node.argument);
      if (node.operator === '-') return -value;
      if (node.operator === '+') return +value;
      throw new Error(`Unsupported unary operator: ${node.operator}`);
    }
    case 'TemplateLiteral':
      if (node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? '';
      throw new Error('Template expressions are not allowed in static case data');
    default:
      throw new Error(`Unsupported static value: ${node.type}`);
  }
}

for (const statement of ast.body) {
  if (statement.type === 'VariableDeclaration') {
    for (const declaration of statement.declarations) {
      if (declaration.id.type !== 'Identifier') continue;
      try {
        values.set(declaration.id.name, literal(declaration.init));
      } catch {
        // Runtime/UI declarations are intentionally ignored.
      }
    }
    continue;
  }

  if (
    statement.type === 'ExpressionStatement' &&
    statement.expression.type === 'CallExpression' &&
    statement.expression.callee.type === 'MemberExpression' &&
    statement.expression.callee.object.type === 'Identifier' &&
    statement.expression.callee.object.name === 'Object' &&
    statement.expression.callee.property.type === 'Identifier' &&
    statement.expression.callee.property.name === 'assign'
  ) {
    const [targetNode, sourceNode] = statement.expression.arguments;
    if (targetNode?.type !== 'Identifier' || !values.has(targetNode.name)) continue;
    Object.assign(values.get(targetNode.name), literal(sourceNode));
  }
}

const cases = values.get('cases');
const tags = values.get('tags') ?? {};
const media = values.get('media') ?? {};
const extraMedia = values.get('extraMedia') ?? {};
const ranks = values.get('ranks') ?? {};
const industry = values.get('industry') ?? {};
const metrics = values.get('metrics') ?? {};
const sourceTitles = values.get('sourceTitles') ?? {};

if (!Array.isArray(cases) || cases.length === 0) {
  throw new Error('No static cases array found in the HTML');
}

const tagColors = {
  '主体': '#3B82F6',
  '方法': '#10B981',
  '背景': '#F59E0B'
};
const fallbackTagColors = ['#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

function markdownLink(label, url) {
  return `[${String(label).replaceAll('[', '\\[').replaceAll(']', '\\]')}](${url})`;
}

function periodYears(period) {
  const years = [...String(period ?? '').matchAll(/(?:18|19|20)\d{2}/g)].map((match) => Number(match[0]));
  if (years.length === 0) return {};
  return {
    startYear: years[0],
    ...(years.length > 1 && years.at(-1) !== years[0] ? { endYear: years.at(-1) } : {})
  };
}

function caseImages(caseId) {
  return [media[caseId], ...(extraMedia[caseId] ?? [])].filter(Boolean).slice(0, 5);
}

function buildText(item) {
  const sections = [];
  if (item.city || item.year) {
    sections.push(`*${[item.city, item.year].filter(Boolean).join(' · ')}*`);
  }
  if (item.title) sections.push(`## 项目定位\n\n${item.title}`);
  if (item.summary) sections.push(`## 项目\n\n${item.summary}`);
  if (item.problem) sections.push(`## 背景\n\n${item.problem}`);
  if (item.social) sections.push(`## 行动\n\n${item.social}`);
  if (item.design) sections.push(`## 设计\n\n${item.design}`);
  if (industry[item.id]) sections.push(`## 产业\n\n${industry[item.id]}`);

  const caseMetrics = metrics[item.id] ?? [];
  if (caseMetrics.length > 0) {
    const lines = caseMetrics.map(([value, label, source]) =>
      `- **${value}** — ${source ? markdownLink(label, source) : label}`
    );
    sections.push(`## 成果与数据\n\n${lines.join('\n')}`);
  }

  const images = caseImages(item.id);
  if (images.length > 0) {
    const lines = images.map((image, index) => {
      const label = image.caption || `图片 ${index + 1}`;
      const credit = image.credit ? `；署名：${image.credit}` : '';
      return `- ${markdownLink(label, image.href)}${credit}`;
    });
    sections.push(`## 图片来源\n\n${lines.join('\n')}`);
  }

  if (Array.isArray(item.sources) && item.sources.length > 0) {
    const lines = item.sources.map(([label, url]) => {
      const title = sourceTitles[url]?.[1];
      return `- ${markdownLink(label, url)}${title && title !== label ? ` — ${title}` : ''}`;
    });
    sections.push(`## 参考来源\n\n${lines.join('\n')}`);
  }

  return `# ${item.name}\n\n${sections.join('\n\n')}`.trim();
}

const orderedCases = [...cases].sort((a, b) => (ranks[a.id] ?? a.id) - (ranks[b.id] ?? b.id));
const now = Date.now();
const notes = orderedCases.map((item, index) => {
  const rank = ranks[item.id] ?? index + 1;
  const column = index % 5;
  const row = Math.floor(index / 5);
  const images = caseImages(item.id);
  const imageUrls = images.map((image) => image.src).filter((url) => typeof url === 'string');
  const imageRefs = imageUrls.map((url) => ({
    assetId: url,
    source: { kind: 'remote', url, cacheStatus: 'none' }
  }));
  const mediaItems = imageRefs.map((ref, mediaIndex) => ({
    id: `mid-case-${item.id}-${mediaIndex + 1}`,
    kind: 'image',
    assetId: ref.assetId,
    source: ref.source
  }));
  const noteTags = (tags[item.id] ?? []).map(([type, label], tagIndex) => ({
    id: `tag-case-${item.id}-${tagIndex + 1}`,
    label: `${type} · ${label}`,
    color: tagColors[type] ?? fallbackTagColors[tagIndex % fallbackTagColors.length]
  }));

  return {
    id: `case-${item.id}`,
    createdAt: now + index,
    coords: { lat: item.coords[0], lng: item.coords[1] },
    emoji: '💧',
    text: buildText(item),
    fontSize: 3,
    isFavorite: false,
    weight: 1,
    color: '#FFFDF5',
    images: imageUrls,
    imageRefs,
    media: mediaItems,
    tags: noteTags,
    ...periodYears(item.year),
    boardX: 100 + column * 306,
    boardY: 100 + row * 306,
    variant: 'standard',
    layerStackOrder: orderedCases.length - rank
  };
});

const project = {
  version: '1.0',
  project: {
    id: 'urban-river-social-innovation-map',
    name: '城市河流社会创新地图',
    type: 'map',
    projectKind: 'mapping',
    createdAt: now,
    notes,
    frames: [],
    connections: [],
    themeColor: '#67D6F3',
    backgroundOpacity: 1,
    standardSizeScale: 0.85
  }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ cases: notes.length, images: notes.reduce((sum, note) => sum + note.images.length, 0), outputPath }));
