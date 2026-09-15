import { useEffect, useState } from 'react';

/** 关闭后保留最后一次非空值，供退出动画继续显示对应内容。 */
export function useStickyValue<T>(value: T | null): T | null {
  const [sticky, setSticky] = useState<T | null>(value);
  useEffect(() => {
    if (value != null) setSticky(value);
  }, [value]);
  return value ?? sticky;
}
