(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };

  // node_modules/html-to-image/es/util.js
  var init_util = __esm({
    "node_modules/html-to-image/es/util.js"() {
    }
  });

  // node_modules/html-to-image/es/clone-pseudos.js
  var init_clone_pseudos = __esm({
    "node_modules/html-to-image/es/clone-pseudos.js"() {
      init_util();
    }
  });

  // node_modules/html-to-image/es/mimes.js
  var init_mimes = __esm({
    "node_modules/html-to-image/es/mimes.js"() {
    }
  });

  // node_modules/html-to-image/es/dataurl.js
  var init_dataurl = __esm({
    "node_modules/html-to-image/es/dataurl.js"() {
    }
  });

  // node_modules/html-to-image/es/clone-node.js
  var init_clone_node = __esm({
    "node_modules/html-to-image/es/clone-node.js"() {
      init_clone_pseudos();
      init_util();
      init_mimes();
      init_dataurl();
    }
  });

  // node_modules/html-to-image/es/embed-resources.js
  var init_embed_resources = __esm({
    "node_modules/html-to-image/es/embed-resources.js"() {
      init_util();
      init_mimes();
      init_dataurl();
    }
  });

  // node_modules/html-to-image/es/embed-images.js
  var init_embed_images = __esm({
    "node_modules/html-to-image/es/embed-images.js"() {
      init_embed_resources();
      init_util();
      init_dataurl();
      init_mimes();
    }
  });

  // node_modules/html-to-image/es/apply-style.js
  var init_apply_style = __esm({
    "node_modules/html-to-image/es/apply-style.js"() {
    }
  });

  // node_modules/html-to-image/es/embed-webfonts.js
  var init_embed_webfonts = __esm({
    "node_modules/html-to-image/es/embed-webfonts.js"() {
      init_util();
      init_dataurl();
      init_embed_resources();
    }
  });

  // node_modules/html-to-image/es/index.js
  var init_es = __esm({
    "node_modules/html-to-image/es/index.js"() {
      init_clone_node();
      init_embed_images();
      init_apply_style();
      init_embed_webfonts();
      init_util();
    }
  });

  // constants.ts
  var EMOJI_CATEGORIES = {
    "Recent": ["\u{1F34B}", "\u{1F4CD}", "\u{1F3E0}", "\u{1F3E2}", "\u{1F333}", "\u2764\uFE0F", "\u2B50", "\u{1F374}", "\u2615", "\u{1F37A}", "\u{1F4F7}", "\u2708\uFE0F", "\u{1F6B4}", "\u{1F3C3}", "\u{1F3A8}", "\u{1F3B5}", "\u{1F6D2}", "\u{1F393}", "\u{1F4BC}", "\u{1F4A1}"],
    "Smileys & Emotion": ["\u{1F600}", "\u{1F603}", "\u{1F604}", "\u{1F601}", "\u{1F606}", "\u{1F605}", "\u{1F923}", "\u{1F602}", "\u{1F642}", "\u{1F643}", "\u{1F609}", "\u{1F60A}", "\u{1F607}", "\u{1F970}", "\u{1F60D}", "\u{1F929}", "\u{1F618}", "\u{1F617}", "\u{1F61A}", "\u{1F619}", "\u{1F60B}", "\u{1F61B}", "\u{1F61C}", "\u{1F92A}", "\u{1F61D}", "\u{1F911}", "\u{1F917}", "\u{1F92D}", "\u{1F92B}", "\u{1F914}", "\u{1F910}", "\u{1F928}", "\u{1F610}", "\u{1F611}", "\u{1F636}", "\u{1F60F}", "\u{1F612}", "\u{1F644}", "\u{1F62C}", "\u{1F925}", "\u{1F60C}", "\u{1F614}", "\u{1F62A}", "\u{1F924}", "\u{1F634}", "\u{1F637}", "\u{1F912}", "\u{1F915}", "\u{1F922}", "\u{1F92E}"],
    "Food & Drink": ["\u{1F34E}", "\u{1F34A}", "\u{1F34B}", "\u{1F34C}", "\u{1F349}", "\u{1F347}", "\u{1F353}", "\u{1F348}", "\u{1F352}", "\u{1F351}", "\u{1F96D}", "\u{1F34D}", "\u{1F965}", "\u{1F95D}", "\u{1F345}", "\u{1F346}", "\u{1F951}", "\u{1F966}", "\u{1F96C}", "\u{1F952}", "\u{1F336}\uFE0F", "\u{1F33D}", "\u{1F955}", "\u{1F954}", "\u{1F360}", "\u{1F950}", "\u{1F96F}", "\u{1F35E}", "\u{1F956}", "\u{1F968}", "\u{1F9C0}", "\u{1F95A}", "\u{1F373}", "\u{1F95E}", "\u{1F953}", "\u{1F969}", "\u{1F357}", "\u{1F356}", "\u{1F32D}", "\u{1F354}", "\u{1F35F}", "\u{1F355}", "\u{1F96A}", "\u{1F959}", "\u{1F32E}", "\u{1F32F}", "\u{1F957}", "\u{1F958}", "\u{1F96B}", "\u{1F35D}", "\u{1F35C}", "\u{1F372}", "\u{1F35B}", "\u{1F363}", "\u{1F371}", "\u{1F95F}", "\u{1F364}", "\u{1F359}", "\u{1F35A}", "\u{1F358}", "\u{1F365}", "\u{1F960}", "\u{1F362}", "\u{1F361}", "\u{1F367}", "\u{1F368}", "\u{1F366}", "\u{1F967}", "\u{1F370}", "\u{1F382}", "\u{1F36E}", "\u{1F36D}", "\u{1F36C}", "\u{1F36B}", "\u{1F37F}", "\u{1F369}", "\u{1F36A}", "\u{1F330}", "\u{1F95C}", "\u{1F36F}", "\u{1F95B}", "\u{1F37C}", "\u2615\uFE0F", "\u{1F375}", "\u{1F964}", "\u{1F376}", "\u{1F37A}", "\u{1F37B}", "\u{1F942}", "\u{1F377}", "\u{1F943}", "\u{1F378}", "\u{1F379}", "\u{1F37E}"],
    "Travel & Places": ["\u{1F697}", "\u{1F695}", "\u{1F699}", "\u{1F68C}", "\u{1F68E}", "\u{1F3CE}\uFE0F", "\u{1F693}", "\u{1F691}", "\u{1F692}", "\u{1F690}", "\u{1F69A}", "\u{1F69B}", "\u{1F69C}", "\u{1F6F4}", "\u{1F6B2}", "\u{1F6F5}", "\u{1F3CD}\uFE0F", "\u{1F6FA}", "\u{1F6A8}", "\u{1F694}", "\u{1F68D}", "\u{1F698}", "\u{1F696}", "\u{1F6A1}", "\u{1F6A0}", "\u{1F69F}", "\u{1F683}", "\u{1F68B}", "\u{1F69E}", "\u{1F69D}", "\u{1F684}", "\u{1F685}", "\u{1F688}", "\u{1F682}", "\u{1F686}", "\u{1F687}", "\u{1F68A}", "\u{1F689}", "\u2708\uFE0F", "\u{1F6EB}", "\u{1F6EC}", "\u{1F6E9}\uFE0F", "\u{1F4BA}", "\u{1F681}", "\u{1F69F}", "\u{1F680}", "\u{1F6F8}", "\u{1F6A4}", "\u26F5\uFE0F", "\u{1F6E5}\uFE0F", "\u{1F6F3}\uFE0F", "\u26F4\uFE0F", "\u{1F6A2}", "\u2693\uFE0F", "\u26FD\uFE0F", "\u{1F6A7}", "\u{1F6A6}", "\u{1F6A5}", "\u{1F5FA}\uFE0F", "\u{1F5FF}", "\u{1F5FD}", "\u{1F5FC}", "\u{1F3F0}", "\u{1F3EF}", "\u{1F3DF}\uFE0F", "\u{1F3A1}", "\u{1F3A2}", "\u{1F3A0}", "\u26F2\uFE0F", "\u26F1\uFE0F", "\u{1F3D6}\uFE0F", "\u{1F3DD}\uFE0F", "\u{1F3DC}\uFE0F", "\u{1F30B}", "\u26F0\uFE0F", "\u{1F3D4}\uFE0F", "\u{1F5FB}", "\u{1F3D5}\uFE0F", "\u26FA\uFE0F", "\u{1F3E0}", "\u{1F3E1}", "\u{1F3D8}\uFE0F", "\u{1F3DA}\uFE0F", "\u{1F3D7}\uFE0F", "\u{1F3ED}", "\u{1F3E2}", "\u{1F3EC}", "\u{1F3E3}", "\u{1F3E4}", "\u{1F3E5}", "\u{1F3E6}", "\u{1F3E8}", "\u{1F3EA}", "\u{1F3EB}", "\u{1F3E9}", "\u{1F492}", "\u{1F3DB}\uFE0F", "\u26EA\uFE0F", "\u{1F54C}", "\u{1F54D}", "\u{1F54B}", "\u26E9\uFE0F", "\u{1F6E4}\uFE0F", "\u{1F6E3}\uFE0F", "\u{1F5FE}", "\u{1F391}", "\u{1F3DE}\uFE0F", "\u{1F305}", "\u{1F304}", "\u{1F320}", "\u{1F387}", "\u{1F386}", "\u{1F307}", "\u{1F306}", "\u{1F3D9}\uFE0F", "\u{1F303}", "\u{1F30C}", "\u{1F309}", "\u{1F301}"],
    "Activities": ["\u26BD\uFE0F", "\u{1F3C0}", "\u{1F3C8}", "\u26BE\uFE0F", "\u{1F94E}", "\u{1F3BE}", "\u{1F3D0}", "\u{1F3C9}", "\u{1F94F}", "\u{1F3B1}", "\u{1F3D3}", "\u{1F3F8}", "\u{1F3D2}", "\u{1F3D1}", "\u{1F94D}", "\u{1F3CF}", "\u{1F945}", "\u26F3\uFE0F", "\u{1F3F9}", "\u{1F3A3}", "\u{1F94A}", "\u{1F94B}", "\u{1F3BD}", "\u{1F6F9}", "\u{1F6F7}", "\u26F8\uFE0F", "\u{1F94C}", "\u{1F3BF}", "\u26F7\uFE0F", "\u{1F3C2}", "\u{1F3CB}\uFE0F\u200D\u2640\uFE0F", "\u{1F3CB}\uFE0F", "\u{1F93C}\u200D\u2640\uFE0F", "\u{1F93C}\u200D\u2642\uFE0F", "\u{1F938}\u200D\u2640\uFE0F", "\u{1F938}\u200D\u2642\uFE0F", "\u26F9\uFE0F\u200D\u2640\uFE0F", "\u26F9\uFE0F", "\u{1F93A}", "\u{1F93E}\u200D\u2640\uFE0F", "\u{1F93E}\u200D\u2642\uFE0F", "\u{1F3CC}\uFE0F\u200D\u2640\uFE0F", "\u{1F3CC}\uFE0F", "\u{1F3C7}", "\u{1F9D8}\u200D\u2640\uFE0F", "\u{1F9D8}\u200D\u2642\uFE0F", "\u{1F3C4}\u200D\u2640\uFE0F", "\u{1F3C4}", "\u{1F3CA}\u200D\u2640\uFE0F", "\u{1F3CA}", "\u{1F93D}\u200D\u2640\uFE0F", "\u{1F93D}\u200D\u2642\uFE0F", "\u{1F6A3}\u200D\u2640\uFE0F", "\u{1F6A3}", "\u{1F9D7}\u200D\u2640\uFE0F", "\u{1F9D7}\u200D\u2642\uFE0F", "\u{1F6B5}\u200D\u2640\uFE0F", "\u{1F6B5}", "\u{1F6B4}\u200D\u2640\uFE0F", "\u{1F6B4}", "\u{1F3C3}\u200D\u2640\uFE0F", "\u{1F3C3}", "\u{1F3C3}\u200D\u2642\uFE0F", "\u{1F46B}", "\u{1F46D}", "\u{1F46C}", "\u{1F491}", "\u{1F469}\u200D\u2764\uFE0F\u200D\u{1F469}", "\u{1F468}\u200D\u2764\uFE0F\u200D\u{1F468}", "\u{1F48F}", "\u{1F469}\u200D\u2764\uFE0F\u200D\u{1F48B}\u200D\u{1F469}", "\u{1F468}\u200D\u2764\uFE0F\u200D\u{1F48B}\u200D\u{1F468}", "\u{1F46A}", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F469}\u200D\u{1F466}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F467}", "\u{1F469}\u200D\u{1F469}\u200D\u{1F466}", "\u{1F469}\u200D\u{1F469}\u200D\u{1F467}", "\u{1F469}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}", "\u{1F469}\u200D\u{1F469}\u200D\u{1F466}\u200D\u{1F466}", "\u{1F469}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F467}", "\u{1F468}\u200D\u{1F468}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F468}\u200D\u{1F467}", "\u{1F468}\u200D\u{1F468}\u200D\u{1F467}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F468}\u200D\u{1F466}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F468}\u200D\u{1F467}\u200D\u{1F467}", "\u{1F469}\u200D\u{1F466}", "\u{1F469}\u200D\u{1F467}", "\u{1F469}\u200D\u{1F467}\u200D\u{1F466}", "\u{1F469}\u200D\u{1F466}\u200D\u{1F466}", "\u{1F469}\u200D\u{1F467}\u200D\u{1F467}", "\u{1F468}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F467}", "\u{1F468}\u200D\u{1F467}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F466}\u200D\u{1F466}", "\u{1F468}\u200D\u{1F467}\u200D\u{1F467}"],
    "Objects": ["\u231A\uFE0F", "\u{1F4F1}", "\u{1F4F2}", "\u{1F4BB}", "\u2328\uFE0F", "\u{1F5A5}\uFE0F", "\u{1F5A8}\uFE0F", "\u{1F5B1}\uFE0F", "\u{1F5B2}\uFE0F", "\u{1F579}\uFE0F", "\u{1F5DC}\uFE0F", "\u{1F4BE}", "\u{1F4BF}", "\u{1F4C0}", "\u{1F4FC}", "\u{1F4F7}", "\u{1F4F8}", "\u{1F4F9}", "\u{1F3A5}", "\u{1F4FD}\uFE0F", "\u{1F39E}\uFE0F", "\u{1F4DE}", "\u260E\uFE0F", "\u{1F4DF}", "\u{1F4E0}", "\u{1F4FA}", "\u{1F4FB}", "\u{1F399}\uFE0F", "\u{1F39A}\uFE0F", "\u{1F39B}\uFE0F", "\u23F1\uFE0F", "\u23F2\uFE0F", "\u23F0", "\u{1F570}\uFE0F", "\u231B\uFE0F", "\u23F3", "\u{1F4E1}", "\u{1F50B}", "\u{1F50C}", "\u{1F4A1}", "\u{1F526}", "\u{1F56F}\uFE0F", "\u{1FA94}", "\u{1F9EF}", "\u{1F6E2}\uFE0F", "\u{1F4B8}", "\u{1F4B5}", "\u{1F4B4}", "\u{1F4B6}", "\u{1F4B7}", "\u{1F4B0}", "\u{1F4B3}", "\u{1F48E}", "\u2696\uFE0F", "\u{1FA9C}", "\u{1F9F0}", "\u{1FA9B}", "\u{1F527}", "\u{1F528}", "\u2692\uFE0F", "\u{1F6E0}\uFE0F", "\u26CF\uFE0F", "\u{1FA9A}", "\u{1F529}", "\u2699\uFE0F", "\u{1FAA4}", "\u{1F9F1}", "\u26D3\uFE0F", "\u{1F9F2}", "\u{1F52B}", "\u{1F4A3}", "\u{1F9E8}", "\u{1FA93}", "\u{1F52A}", "\u{1F5E1}\uFE0F", "\u2694\uFE0F", "\u{1F6E1}\uFE0F", "\u{1F6AC}", "\u26B0\uFE0F", "\u{1FAA6}", "\u26B1\uFE0F", "\u{1F3FA}", "\u{1F52E}", "\u{1F4FF}", "\u{1F9FF}", "\u{1F488}", "\u2697\uFE0F", "\u{1F52D}", "\u{1F52C}", "\u{1F573}\uFE0F", "\u{1FA79}", "\u{1FA7A}", "\u{1F48A}", "\u{1F489}", "\u{1FA78}", "\u{1F9EC}", "\u{1F9A0}", "\u{1F9EB}", "\u{1F9EA}", "\u{1F321}\uFE0F", "\u{1F9F9}", "\u{1FAA0}", "\u{1F9FA}", "\u{1F9FB}", "\u{1F6BD}", "\u{1F6B0}", "\u{1F6BF}", "\u{1F6C1}", "\u{1F6C0}", "\u{1F9FC}", "\u{1FAA5}", "\u{1FA92}", "\u{1F9FD}", "\u{1FAA3}", "\u{1F9F4}", "\u{1F6CE}\uFE0F", "\u{1F511}", "\u{1F5DD}\uFE0F", "\u{1F6AA}", "\u{1FA91}", "\u{1F6CB}\uFE0F", "\u{1F6CF}\uFE0F", "\u{1F6CC}", "\u{1F9F8}", "\u{1FA86}", "\u{1F5BC}\uFE0F", "\u{1FA9E}", "\u{1FA9F}", "\u{1F6CD}\uFE0F", "\u{1F6D2}", "\u{1F381}", "\u{1F388}", "\u{1F389}", "\u{1F38A}", "\u{1F380}", "\u{1F397}\uFE0F", "\u{1FA84}", "\u{1FA85}", "\u{1FAA1}", "\u{1F9F5}", "\u{1FAA2}"],
    "Symbols": ["\u2764\uFE0F", "\u{1F9E1}", "\u{1F49B}", "\u{1F49A}", "\u{1F499}", "\u{1F49C}", "\u{1F5A4}", "\u{1F90D}", "\u{1F90E}", "\u{1F494}", "\u2763\uFE0F", "\u{1F495}", "\u{1F49E}", "\u{1F493}", "\u{1F497}", "\u{1F496}", "\u{1F498}", "\u{1F49D}", "\u{1F49F}", "\u262E\uFE0F", "\u271D\uFE0F", "\u262A\uFE0F", "\u{1F549}\uFE0F", "\u2638\uFE0F", "\u2721\uFE0F", "\u{1F52F}", "\u{1F54E}", "\u262F\uFE0F", "\u2626\uFE0F", "\u{1F6D0}", "\u26CE", "\u2648\uFE0F", "\u2649\uFE0F", "\u264A\uFE0F", "\u264B\uFE0F", "\u264C\uFE0F", "\u264D\uFE0F", "\u264E\uFE0F", "\u264F\uFE0F", "\u2650\uFE0F", "\u2651\uFE0F", "\u2652\uFE0F", "\u2653\uFE0F", "\u{1F194}", "\u269B\uFE0F", "\u{1F251}", "\u2622\uFE0F", "\u2623\uFE0F", "\u{1F4F4}", "\u{1F4F3}", "\u{1F236}", "\u{1F21A}\uFE0F", "\u{1F238}", "\u{1F23A}", "\u{1F237}\uFE0F", "\u2734\uFE0F", "\u{1F19A}", "\u{1F4AE}", "\u{1F250}", "\u3299\uFE0F", "\u3297\uFE0F", "\u{1F234}", "\u{1F235}", "\u{1F239}", "\u{1F232}", "\u{1F170}\uFE0F", "\u{1F171}\uFE0F", "\u{1F18E}", "\u{1F191}", "\u{1F17E}\uFE0F", "\u{1F198}", "\u274C", "\u2B55\uFE0F", "\u{1F6D1}", "\u26D4\uFE0F", "\u{1F4DB}", "\u{1F6AB}", "\u{1F4AF}", "\u{1F4A2}", "\u2668\uFE0F", "\u{1F6B7}", "\u{1F6AF}", "\u{1F6B3}", "\u{1F6B1}", "\u{1F51E}", "\u{1F4F5}", "\u{1F6AD}", "\u2757\uFE0F", "\u2753", "\u2755", "\u2754", "\u203C\uFE0F", "\u2049\uFE0F", "\u{1F505}", "\u{1F506}", "\u303D\uFE0F", "\u26A0\uFE0F", "\u{1F6B8}", "\u{1F531}", "\u269C\uFE0F", "\u{1F530}", "\u267B\uFE0F", "\u2705", "\u{1F22F}\uFE0F", "\u{1F4B9}", "\u2747\uFE0F", "\u2733\uFE0F", "\u274E", "\u{1F310}", "\u{1F4A0}", "\u24C2\uFE0F", "\u{1F300}", "\u{1F4A4}", "\u{1F3E7}", "\u{1F6BE}", "\u267F\uFE0F", "\u{1F17F}\uFE0F", "\u{1F233}", "\u{1F202}\uFE0F", "\u{1F6C2}", "\u{1F6C3}", "\u{1F6C4}", "\u{1F6C5}", "\u{1F6B9}", "\u{1F6BA}", "\u{1F6BC}", "\u{1F6BB}", "\u{1F6AE}", "\u{1F3A6}", "\u{1F4F6}", "\u{1F201}", "\u{1F523}", "\u2139\uFE0F", "\u{1F524}", "\u{1F521}", "\u{1F520}", "\u{1F196}", "\u{1F197}", "\u{1F199}", "\u{1F192}", "\u{1F195}", "\u{1F193}", "0\uFE0F\u20E3", "1\uFE0F\u20E3", "2\uFE0F\u20E3", "3\uFE0F\u20E3", "4\uFE0F\u20E3", "5\uFE0F\u20E3", "6\uFE0F\u20E3", "7\uFE0F\u20E3", "8\uFE0F\u20E3", "9\uFE0F\u20E3", "\u{1F51F}", "\u{1F522}", "#\uFE0F\u20E3", "*\uFE0F\u20E3", "\u23CF\uFE0F", "\u25B6\uFE0F", "\u23F8\uFE0F", "\u23EF\uFE0F", "\u23F9\uFE0F", "\u23FA\uFE0F", "\u23ED\uFE0F", "\u23EE\uFE0F", "\u23E9\uFE0F", "\u23EA\uFE0F", "\u23EB", "\u23EC", "\u25C0\uFE0F", "\u{1F53C}", "\u{1F53D}", "\u27A1\uFE0F", "\u2B05\uFE0F", "\u2B06\uFE0F", "\u2B07\uFE0F", "\u2197\uFE0F", "\u2198\uFE0F", "\u2199\uFE0F", "\u2196\uFE0F", "\u2195\uFE0F", "\u2194\uFE0F", "\u21AA\uFE0F", "\u21A9\uFE0F", "\u2934\uFE0F", "\u2935\uFE0F", "\u{1F500}", "\u{1F501}", "\u{1F502}", "\u{1F504}", "\u{1F503}", "\u{1F3B5}", "\u{1F3B6}", "\u2795", "\u2796", "\u2797", "\u2716\uFE0F", "\u{1F4B2}", "\u{1F4B1}", "\u2122\uFE0F", "\xA9\uFE0F", "\xAE\uFE0F", "\u3030\uFE0F", "\u27B0", "\u27BF", "\u{1F51A}", "\u{1F519}", "\u{1F51B}", "\u{1F51C}", "\u{1F51D}", "\u{1F6D0}", "\u271D\uFE0F", "\u262A\uFE0F", "\u262E\uFE0F", "\u{1F549}\uFE0F", "\u2638\uFE0F", "\u2721\uFE0F", "\u{1F52F}", "\u{1F54E}", "\u262F\uFE0F", "\u2626\uFE0F", "\u{1F6D0}", "\u26CE", "\u2648\uFE0F", "\u2649\uFE0F", "\u264A\uFE0F", "\u264B\uFE0F", "\u264C\uFE0F", "\u264D\uFE0F", "\u264E\uFE0F", "\u264F\uFE0F", "\u2650\uFE0F", "\u2651\uFE0F", "\u2652\uFE0F", "\u2653\uFE0F", "\u{1F194}", "\u269B\uFE0F", "\u{1F251}", "\u2622\uFE0F", "\u2623\uFE0F", "\u{1F4F4}", "\u{1F4F3}", "\u{1F236}", "\u{1F21A}\uFE0F", "\u{1F238}", "\u{1F23A}", "\u{1F237}\uFE0F", "\u2734\uFE0F", "\u{1F19A}", "\u{1F4AE}", "\u{1F250}", "\u3299\uFE0F", "\u3297\uFE0F", "\u{1F234}", "\u{1F235}", "\u{1F239}", "\u{1F232}", "\u{1F170}\uFE0F", "\u{1F171}\uFE0F", "\u{1F18E}", "\u{1F191}", "\u{1F17E}\uFE0F", "\u{1F198}", "\u274C", "\u2B55\uFE0F", "\u{1F6D1}", "\u26D4\uFE0F", "\u{1F4DB}", "\u{1F6AB}", "\u{1F4AF}", "\u{1F4A2}", "\u2668\uFE0F", "\u{1F6B7}", "\u{1F6AF}", "\u{1F6B3}", "\u{1F6B1}", "\u{1F51E}", "\u{1F4F5}", "\u{1F6AD}", "\u2757\uFE0F", "\u2753", "\u2755", "\u2754", "\u203C\uFE0F", "\u2049\uFE0F", "\u{1F505}", "\u{1F506}", "\u303D\uFE0F", "\u26A0\uFE0F", "\u{1F6B8}", "\u{1F531}", "\u269C\uFE0F", "\u{1F530}", "\u267B\uFE0F", "\u2705", "\u{1F22F}\uFE0F", "\u{1F4B9}", "\u2747\uFE0F", "\u2733\uFE0F", "\u274E", "\u{1F310}", "\u{1F4A0}", "\u24C2\uFE0F", "\u{1F300}", "\u{1F4A4}", "\u{1F3E7}", "\u{1F6BE}", "\u267F\uFE0F", "\u{1F17F}\uFE0F", "\u{1F233}", "\u{1F202}\uFE0F", "\u{1F6C2}", "\u{1F6C3}", "\u{1F6C4}", "\u{1F6C5}", "\u{1F6B9}", "\u{1F6BA}", "\u{1F6BC}", "\u{1F6BB}", "\u{1F6AE}", "\u{1F3A6}", "\u{1F4F6}", "\u{1F201}", "\u{1F523}", "\u2139\uFE0F", "\u{1F524}", "\u{1F521}", "\u{1F520}", "\u{1F196}", "\u{1F197}", "\u{1F199}", "\u{1F192}", "\u{1F195}", "\u{1F193}", "0\uFE0F\u20E3", "1\uFE0F\u20E3", "2\uFE0F\u20E3", "3\uFE0F\u20E3", "4\uFE0F\u20E3", "5\uFE0F\u20E3", "6\uFE0F\u20E3", "7\uFE0F\u20E3", "8\uFE0F\u20E3", "9\uFE0F\u20E3", "\u{1F51F}", "\u{1F522}", "#\uFE0F\u20E3", "*\uFE0F\u20E3", "\u23CF\uFE0F", "\u25B6\uFE0F", "\u23F8\uFE0F", "\u23EF\uFE0F", "\u23F9\uFE0F", "\u23FA\uFE0F", "\u23ED\uFE0F", "\u23EE\uFE0F", "\u23E9\uFE0F", "\u23EA\uFE0F", "\u23EB", "\u23EC", "\u25C0\uFE0F", "\u{1F53C}", "\u{1F53D}", "\u27A1\uFE0F", "\u2B05\uFE0F", "\u2B06\uFE0F", "\u2B07\uFE0F", "\u2197\uFE0F", "\u2198\uFE0F", "\u2199\uFE0F", "\u2196\uFE0F", "\u2195\uFE0F", "\u2194\uFE0F", "\u21AA\uFE0F", "\u21A9\uFE0F", "\u2934\uFE0F", "\u2935\uFE0F", "\u{1F500}", "\u{1F501}", "\u{1F502}", "\u{1F504}", "\u{1F503}", "\u{1F3B5}", "\u{1F3B6}", "\u2795", "\u2796", "\u2797", "\u2716\uFE0F", "\u{1F4B2}", "\u{1F4B1}", "\u2122\uFE0F", "\xA9\uFE0F", "\xAE\uFE0F", "\u3030\uFE0F", "\u27B0", "\u27BF", "\u{1F51A}", "\u{1F519}", "\u{1F51B}", "\u{1F51C}", "\u{1F51D}"]
  };
  var EMOJI_LIST = EMOJI_CATEGORIES["Recent"];
  var DEFAULT_THEME_COLOR = "#FFDD00";
  var DEFAULT_THEME_COLOR_DARK = "#E6C300";
  var getCurrentThemeColor = () => {
    try {
      const saved = localStorage.getItem("mapp-theme-color");
      return saved || DEFAULT_THEME_COLOR;
    } catch {
      return DEFAULT_THEME_COLOR;
    }
  };
  var getCurrentThemeColorDark = () => {
    try {
      const saved = localStorage.getItem("mapp-theme-color-dark");
      return saved || DEFAULT_THEME_COLOR_DARK;
    } catch {
      return DEFAULT_THEME_COLOR_DARK;
    }
  };
  var THEME_COLOR = getCurrentThemeColor();
  var THEME_COLOR_DARK = getCurrentThemeColorDark();
  var PROJECT_OPEN_OVERLAY_FADE_S = 0.2;
  var PROJECT_OPEN_OVERLAY_FADE_MS = Math.round(PROJECT_OPEN_OVERLAY_FADE_S * 1e3);

  // utils.ts
  init_es();

  // utils/theme/themeChrome.ts
  var LAB_EPS = 216 / 24389;
  var LAB_KAPPA = 24389 / 27;

  // utils/map/mapChromeStyle.ts
  var DEFAULT_MAP_UI_CHROME_OPACITY = 0.9;
  var DEFAULT_MAP_UI_CHROME_BLUR_PX = 8;
  function mapChromeModalBackdropStyle(opacity, blurPx) {
    const o = Math.min(1, Math.max(0, opacity));
    const b = Math.min(48, Math.max(0, blurPx));
    const style = {
      // 透明面板对应更轻的背景压暗；满不透明面板也只到 20%，保持地图/画布仍可辨认。
      backgroundColor: `rgba(0, 0, 0, ${0.04 + o * 0.16})`
    };
    if (b > 0) {
      const f = `blur(${b}px)`;
      style.backdropFilter = f;
      style.WebkitBackdropFilter = f;
    }
    return style;
  }
  var MODAL_BACKDROP_MASK_STYLE = mapChromeModalBackdropStyle(
    DEFAULT_MAP_UI_CHROME_OPACITY,
    DEFAULT_MAP_UI_CHROME_BLUR_PX
  );
  var MAP_CHROME_SURFACE_BORDER_CLASS = "border border-gray-100/80";
  var MAP_CHROME_SURFACE_SHELL_CLASS = `rounded-lg shadow-lg ${MAP_CHROME_SURFACE_BORDER_CLASS}`;
  function mapChromeSurfaceStyle(opacity, blurPx) {
    const o = Math.min(1, Math.max(0, opacity));
    const b = Math.min(48, Math.max(0, blurPx));
    const style = {
      backgroundColor: `rgba(255, 255, 255, ${o})`
    };
    if (b > 0) {
      const f = `blur(${b}px)`;
      style.backdropFilter = f;
      style.WebkitBackdropFilter = f;
    }
    return style;
  }

  // utils/layer/unifiedNoteLayer.ts
  var GRAPH_UNEMOJI_GROUP = "\u65E0 Emoji";

  // utils/graph/graphRuntimeCore.ts
  var GRAPH_SORT_LOCALE = "zh-Hans-CN";
  var GRAPH_UNTAGGED_TAG_GROUP = "\u65E0\u6807\u7B7E";
  var GRAPH_LAYER_WEIGHT_MIN = 0.1;
  var GRAPH_LAYER_WEIGHT_MAX = 1;
  var GRAPH_LAYER_WEIGHT_SPAN = GRAPH_LAYER_WEIGHT_MAX - GRAPH_LAYER_WEIGHT_MIN;
  function getGraphLayerCandidateKeys(n, standard) {
    if (standard === "tag") {
      const k = n.data("tagGroup");
      return [String(k ?? "").trim()];
    }
    if (standard === "emoji") {
      return [String(n.data("emojiGroup") ?? GRAPH_UNEMOJI_GROUP).trim() || GRAPH_UNEMOJI_GROUP];
    }
    const raw = n.data("frameGroups");
    const arr = Array.isArray(raw) ? raw : (
      // 兼容旧导出/历史数据：仅有首簇归属字段
      [n.data("frameGroup")]
    );
    return arr.map((x) => String(x ?? "").trim()).filter((x) => x !== "");
  }
  function getGraphLayerEffectiveGroupKey(n, standard, hiddenSet) {
    if (standard === "tag" || standard === "emoji") {
      const k = n.data(standard === "tag" ? "tagGroup" : "emojiGroup");
      return String(k ?? "").trim();
    }
    const candidates = getGraphLayerCandidateKeys(n, standard);
    if (candidates.length === 0) return "";
    for (const id of candidates) {
      if (!hiddenSet.has(id)) return id;
    }
    return candidates[0];
  }
  function applyGraphLayerNodeVisibility(cy, hidden, standard = "tag") {
    const hiddenSet = new Set(hidden.map((h) => String(h).trim()));
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        const g = getGraphLayerEffectiveGroupKey(node, standard, hiddenSet);
        let disp = hiddenSet.has(g) ? "none" : "element";
        if (disp === "element") {
          const lh = node.data("layerItemHidden");
          if (lh === true || lh === "yes" || lh === 1) disp = "none";
        }
        node.style("display", disp);
      });
    });
    applyGraphNodeStackZIndex(cy);
  }
  function applyGraphDualLayerNodeVisibility(cy, tagHidden, frameHidden, tagVisibilityLogic = "or", emojiHidden = []) {
    const tagSet = new Set(tagHidden.map((h) => String(h).trim()));
    const frameSet = new Set(frameHidden.map((h) => String(h).trim()));
    const emojiSet = new Set(emojiHidden.map((h) => String(h).trim()));
    const logic = tagVisibilityLogic === "and" ? "and" : "or";
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        if (node.hasClass("frame-cluster-halo") || node.hasClass("frame-cluster-label")) return;
        const rawLabels = node.data("tagLabels");
        const tagLabels = Array.isArray(rawLabels) ? rawLabels.map((x) => String(x).trim()).filter(Boolean) : [];
        let tagBlocked;
        if (tagLabels.length === 0) {
          tagBlocked = tagSet.has(GRAPH_UNTAGGED_TAG_GROUP);
        } else if (logic === "and") {
          tagBlocked = tagLabels.some((l) => tagSet.has(l));
        } else {
          tagBlocked = tagLabels.every((l) => tagSet.has(l));
        }
        const frameKey = getGraphLayerEffectiveGroupKey(node, "frame", frameSet);
        const emojiKey = getGraphLayerEffectiveGroupKey(node, "emoji", emojiSet);
        let disp = tagBlocked || frameSet.has(frameKey) || emojiSet.has(emojiKey) ? "none" : "element";
        if (disp === "element") {
          const lh = node.data("layerItemHidden");
          if (lh === true || lh === "yes" || lh === 1) disp = "none";
        }
        if (disp === "none" && (node.hasClass("focus-core") || node.hasClass("focus-nh") || node.hasClass("focus-edge-endpoint"))) {
          disp = "element";
        }
        node.style("display", disp);
      });
    });
    applyGraphNodeStackZIndex(cy);
  }
  var GRAPH_Z_BOOST = {
    nh: 1e5,
    endpoint: 11e4,
    core: 12e4,
    hover: 13e4
  };
  function applyGraphNodeStackZIndex(cy) {
    if (!cy || cy.destroyed?.()) return;
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        if (node.hasClass("frame-cluster-halo") || node.hasClass("frame-cluster-label")) return;
        const base = Number(node.data("stackZ"));
        const stack = Number.isFinite(base) ? base : 2;
        let boost = 0;
        if (node.hasClass("focus-hover")) boost = GRAPH_Z_BOOST.hover;
        else if (node.hasClass("focus-core")) boost = GRAPH_Z_BOOST.core;
        else if (node.hasClass("focus-edge-endpoint")) boost = GRAPH_Z_BOOST.endpoint;
        else if (node.hasClass("focus-nh")) boost = GRAPH_Z_BOOST.nh;
        node.style({
          "z-compound-depth": boost > 0 ? "top" : "auto",
          "z-index": stack + boost
        });
      });
    });
  }
  var GRAPH_WHEEL_ZOOM_SENSITIVITY = 1e-3;
  function getCyRenderer(cy) {
    const r = cy.renderer?.();
    return r && typeof r.projectIntoViewport === "function" ? r : null;
  }
  function isCyActive(cy) {
    if (!cy) return false;
    try {
      return !cy.destroyed?.();
    } catch {
      return false;
    }
  }
  function attachBoardlikeWheelZoom(cy) {
    const container = cy.container();
    if (!container) return () => {
    };
    const handler = (e) => {
      if (!container.contains(e.target)) return;
      e.preventDefault();
      const scrollDelta = e.shiftKey ? Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY : e.deltaY;
      if (scrollDelta === 0) return;
      const delta = -scrollDelta * GRAPH_WHEEL_ZOOM_SENSITIVITY;
      const z = cy.zoom();
      const minZ = cy.minZoom();
      const maxZ = cy.maxZoom();
      const newZoom = Math.min(Math.max(minZ, z + delta), maxZ);
      if (Math.abs(newZoom - z) < 1e-9) return;
      const r = getCyRenderer(cy);
      if (!r) return;
      const pos = r.projectIntoViewport(e.clientX, e.clientY);
      const pan = cy.pan();
      const rz = cy.zoom();
      const rx = pos[0] * rz + pan.x;
      const ry = pos[1] * rz + pan.y;
      cy.zoom({ level: newZoom, renderedPosition: { x: rx, y: ry } });
    };
    let attached = false;
    const attach = () => {
      if (attached) return;
      attached = true;
      container.addEventListener("wheel", handler, { passive: false });
    };
    cy.ready(attach);
    return () => {
      if (attached) {
        container.removeEventListener("wheel", handler);
        attached = false;
      }
    };
  }
  function decodeGraphPayloadFromBase64(b64) {
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  }
  function attachGraphResizeObserver(cy, el) {
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (!isCyActive(cy)) return;
        cy.resize();
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }
  function scheduleGraphResizeAndFit(cy) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!isCyActive(cy)) return;
        cy.resize();
        cy.fit(void 0, 40);
      });
    });
  }
  function updateGraphStylesheet(cy, stylesheet) {
    cy.style().fromJson(stylesheet).update();
  }
  function syncGraphEdgeCurveDistances(cy) {
    const pairIndex = /* @__PURE__ */ new Map();
    cy.batch(() => {
      cy.edges().forEach((edge) => {
        const s = edge.source();
        const t = edge.target();
        if (s.empty() || t.empty() || !s.isNode() || !t.isNode()) return;
        if (s.hasClass("frame-cluster-label") || t.hasClass("frame-cluster-label") || s.hasClass("frame-cluster-halo") || t.hasClass("frame-cluster-halo")) {
          return;
        }
        const sp = s.position();
        const tp = t.position();
        const dx = tp.x - sp.x;
        const dy = tp.y - sp.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (!Number.isFinite(len) || len < 1e-3) {
          edge.data("controlPointDistance", 0);
          return;
        }
        const a = s.id();
        const b = t.id();
        const pairKey = a < b ? `${a}\0${b}` : `${b}\0${a}`;
        const idx = pairIndex.get(pairKey) ?? 0;
        pairIndex.set(pairKey, idx + 1);
        const sign = idx % 2 === 0 ? 1 : -1;
        const band = Math.floor(idx / 2) + 1;
        const mag = Math.max(14, Math.min(140, len * 0.2)) * (0.85 + (band - 1) * 0.45);
        edge.data("controlPointDistance", sign * mag);
        edge.data("curveSign", sign);
      });
    });
  }
  var HL = ["focus-core", "focus-nh", "focus-e"];
  var FOCUS_CORE_SIZE_ANIM_MS = 180;
  function graphNodeBaseSizePx(node) {
    const fav = node.data("favorite") === "yes";
    const raw = Number(node.data(fav ? "nodeSizeFav" : "nodeSize"));
    if (Number.isFinite(raw) && raw > 0) return raw;
    return 28;
  }
  function graphNodeFocusCoreSizePx(node) {
    const fav = node.data("favorite") === "yes";
    const raw = Number(node.data(fav ? "nodeSizeFavCore" : "nodeSizeCore"));
    if (Number.isFinite(raw) && raw > 0) return raw;
    return graphNodeBaseSizePx(node) * GRAPH_FOCUS_CORE_NODE_SCALE;
  }
  function graphNodeRenderedSizePx(node) {
    const w = node.numericStyle("width");
    if (typeof w === "number" && Number.isFinite(w) && w > 0) return w;
    const bb = node.boundingBox({ includeLabels: false });
    const d = Math.max(bb.w, bb.h);
    return Number.isFinite(d) && d > 0 ? d : graphNodeBaseSizePx(node);
  }
  function animateGraphNodeDiameter(node, targetPx, wantCore) {
    const cy = node.cy();
    if (!cy || cy.destroyed()) return;
    const from = graphNodeRenderedSizePx(node);
    node.stop(true);
    if (Math.abs(from - targetPx) < 0.5) {
      node.removeStyle("width");
      node.removeStyle("height");
      return;
    }
    node.style({ width: from, height: from });
    const anim = node.animation({
      style: { width: targetPx, height: targetPx },
      duration: FOCUS_CORE_SIZE_ANIM_MS,
      easing: "ease-out"
    });
    anim.play().promise("complete").then(() => {
      if (cy.destroyed() || node.removed()) return;
      if (node.hasClass("focus-core") === wantCore) {
        node.removeStyle("width");
        node.removeStyle("height");
      }
    });
  }
  var GRAPH_HOVER_CLASS = "focus-hover";
  function graphEdgeLabelKey(raw) {
    return String(raw ?? "").trim();
  }
  var GRAPH_EMPTY_EDGE_LABEL_DISPLAY = "\uFF08\u65E0\u6807\u7B7E\uFF09";
  function graphEdgeLabelDisplay(key) {
    return key === "" ? GRAPH_EMPTY_EDGE_LABEL_DISPLAY : key;
  }
  function connectionDirectionLocal(c) {
    if (c.arrow === "none") return "none";
    const derivedFrom = c.fromArrow != null ? c.fromArrow : c.arrow === "reverse" ? "arrow" : "none";
    const derivedTo = c.toArrow != null ? c.toArrow : c.arrow === "forward" ? "arrow" : "none";
    if (derivedFrom === "arrow" && derivedTo === "arrow") return "both";
    if (derivedTo === "arrow") return "forward";
    if (derivedFrom === "arrow") return "backward";
    return "none";
  }
  function relatedEdgeSelectionKey(column, labelKey) {
    return `${column}${labelKey}`;
  }
  function relatedEdgeColumnForEndpoint(endpointId, dir, fromNoteId, toNoteId) {
    if (dir === "both" || dir === "none") return "to";
    const semanticSource = dir === "forward" ? fromNoteId : toNoteId;
    return endpointId === semanticSource ? "to" : "from";
  }
  function sortRelatedEntries(entries) {
    return entries.sort((a, b) => {
      if (a.labelKey === "" && b.labelKey !== "") return 1;
      if (b.labelKey === "" && a.labelKey !== "") return -1;
      return a.label.localeCompare(b.label, GRAPH_SORT_LOCALE);
    });
  }
  function collectRelatedEdgeLabelEntries(centerId, connections, chainLength = 1) {
    const depth = Math.max(1, Math.floor(Number.isFinite(chainLength) ? chainLength : 1));
    const byNode = /* @__PURE__ */ new Map();
    for (const c of connections) {
      if (!byNode.has(c.fromNoteId)) byNode.set(c.fromNoteId, []);
      if (!byNode.has(c.toNoteId)) byNode.set(c.toNoteId, []);
      byNode.get(c.fromNoteId).push(c);
      if (c.fromNoteId !== c.toNoteId) byNode.get(c.toNoteId).push(c);
    }
    const seenEdges = /* @__PURE__ */ new Set();
    const fromCounts = /* @__PURE__ */ new Map();
    const toCounts = /* @__PURE__ */ new Map();
    const nodeIds = /* @__PURE__ */ new Set([centerId]);
    let frontier = /* @__PURE__ */ new Set([centerId]);
    for (let dist = 0; dist < depth; dist += 1) {
      const nextFrontier = /* @__PURE__ */ new Set();
      for (const nodeId of frontier) {
        for (const c of byNode.get(nodeId) ?? []) {
          if (seenEdges.has(c.id)) continue;
          seenEdges.add(c.id);
          const labelKey = graphEdgeLabelKey(c.label);
          const dir = connectionDirectionLocal(c);
          const column = relatedEdgeColumnForEndpoint(nodeId, dir, c.fromNoteId, c.toNoteId);
          const bucket = column === "from" ? fromCounts : toCounts;
          bucket.set(labelKey, (bucket.get(labelKey) ?? 0) + 1);
          const otherId = c.fromNoteId === nodeId ? c.toNoteId : c.fromNoteId;
          if (!nodeIds.has(otherId)) {
            nodeIds.add(otherId);
            nextFrontier.add(otherId);
          }
        }
      }
      frontier = nextFrontier;
      if (frontier.size === 0) break;
    }
    const toEntries = (column, counts) => sortRelatedEntries(
      [...counts.entries()].map(([labelKey, count]) => ({
        key: relatedEdgeSelectionKey(column, labelKey),
        column,
        labelKey,
        label: graphEdgeLabelDisplay(labelKey),
        count
      }))
    );
    return {
      from: toEntries("from", fromCounts),
      to: toEntries("to", toCounts)
    };
  }
  function flattenRelatedEdgeLabelGroups(groups) {
    return [...groups.from, ...groups.to];
  }
  function applyGraphNeighborHighlight(cy, centerId, chainLength = 1, allowedEdgeLabelKeys = null) {
    const centerIds = (!centerId ? [] : typeof centerId === "string" ? [centerId] : [...centerId]).filter((id) => typeof id === "string" && id.length > 0);
    const centerSet = new Set(centerIds);
    const prevCores = cy.nodes(".focus-core").toArray();
    for (const n of prevCores) {
      if (centerSet.has(n.id())) continue;
      const w = graphNodeRenderedSizePx(n);
      n.stop(true);
      n.style({ width: w, height: w });
    }
    cy.batch(() => {
      cy.elements().removeClass([...HL]);
      if (centerIds.length === 0) return;
      const depth = Math.max(1, Math.floor(Number.isFinite(chainLength) ? chainLength : 1));
      const nodeIds = new Set(centerIds);
      const edgeIds = /* @__PURE__ */ new Set();
      let frontier = new Set(centerIds);
      for (let dist = 0; dist < depth; dist += 1) {
        const nextFrontier = /* @__PURE__ */ new Set();
        for (const nodeId of frontier) {
          const nodeEl = cy.getElementById(nodeId);
          if (nodeEl.empty() || !nodeEl.isNode()) continue;
          nodeEl.connectedEdges().forEach((edge) => {
            if (allowedEdgeLabelKeys) {
              const labelKey = graphEdgeLabelKey(edge.data("label"));
              const rawDir = String(edge.data("direction") ?? "none");
              const dir = rawDir === "forward" || rawDir === "backward" || rawDir === "both" || rawDir === "none" ? rawDir : "none";
              const srcId = edge.source().id();
              const tgtId = edge.target().id();
              const column = relatedEdgeColumnForEndpoint(nodeId, dir, srcId, tgtId);
              const selKey = relatedEdgeSelectionKey(column, labelKey);
              if (!allowedEdgeLabelKeys.has(selKey)) return;
            }
            edgeIds.add(edge.id());
            const ns = edge.connectedNodes();
            if (ns.length !== 2) return;
            const otherId = ns[0].id() === nodeId ? ns[1].id() : ns[0].id();
            if (!nodeIds.has(otherId)) {
              nodeIds.add(otherId);
              nextFrontier.add(otherId);
            }
          });
        }
        frontier = nextFrontier;
        if (frontier.size === 0) break;
      }
      for (const id of centerIds) {
        const el = cy.getElementById(id);
        if (!el.empty() && el.isNode()) el.addClass("focus-core");
      }
      nodeIds.forEach((id) => {
        if (centerSet.has(id)) return;
        const n = cy.getElementById(id);
        if (!n.empty() && n.isNode()) n.addClass("focus-nh");
      });
      edgeIds.forEach((id) => {
        const e = cy.getElementById(id);
        if (!e.empty() && e.isEdge()) e.addClass("focus-e");
      });
    });
    applyGraphNodeStackZIndex(cy);
    const prevCoreIds = new Set(prevCores.map((n) => n.id()));
    for (const n of prevCores) {
      if (centerSet.has(n.id())) continue;
      animateGraphNodeDiameter(n, graphNodeBaseSizePx(n), false);
    }
    for (const id of centerIds) {
      const el = cy.getElementById(id);
      if (el.empty() || !el.isNode()) continue;
      if (prevCoreIds.has(id)) continue;
      const base = graphNodeBaseSizePx(el);
      el.stop(true);
      el.style({ width: base, height: base });
      animateGraphNodeDiameter(el, graphNodeFocusCoreSizePx(el), true);
    }
  }
  function applyGraphHoverHighlight(cy, hoverNodeId) {
    cy.batch(() => {
      cy.nodes().removeClass(GRAPH_HOVER_CLASS);
      if (!hoverNodeId) return;
      const el = cy.getElementById(hoverNodeId);
      if (!el.empty() && el.isNode()) el.addClass(GRAPH_HOVER_CLASS);
    });
    applyGraphNodeStackZIndex(cy);
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function withExternalMarkdownLinks(html) {
    return html.replace(/<a\b([^>]*)>/gi, (_full, attrs) => {
      let next = String(attrs).replace(/\s*target\s*=\s*(["']).*?\1/gi, "").replace(/\s*rel\s*=\s*(["']).*?\1/gi, "");
      return `<a${next} target="_blank" rel="noopener noreferrer">`;
    });
  }
  var STANDALONE_DIM_KEEP = "node.focus-core, node.focus-nh, node.focus-hover, node.focus-edge-endpoint, node:selected,edge.focus-e, edge.focus-edge-hover, edge.focus-edge-selected, edge:selected";
  function applyStandaloneGraphDim(cy, hasSelection) {
    cy.batch(() => {
      cy.elements().removeClass("graph-dim");
      if (!hasSelection) return;
      const keep = cy.elements(STANDALONE_DIM_KEEP);
      cy.elements().not(keep).addClass("graph-dim");
    });
  }
  function eyeSvg(open) {
    return open ? `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-4.86"/><path d="m2 2 20 20"/></svg>`;
  }
  function wireStandaloneGraphInteractions(cy, payload, themeColor, marked, onHighlightChange) {
    const previews = payload.notePreviews || {};
    const previewEl = document.getElementById("graph-note-preview");
    const relatedEl = document.getElementById("graph-related-panel");
    const chainLength = Math.max(1, Math.min(3, Math.round(payload.chainLength ?? 1)));
    const connections = payload.connections || [];
    let previewImgIdx = 0;
    let focusedId = null;
    let hoverId = null;
    let relatedKeys = /* @__PURE__ */ new Set();
    const notifyHighlight = () => {
      onHighlightChange?.();
    };
    const applyFocusHighlight = (noteId) => {
      if (!noteId) {
        applyGraphNeighborHighlight(cy, null, chainLength, null);
        applyStandaloneGraphDim(cy, false);
        notifyHighlight();
        return;
      }
      applyGraphNeighborHighlight(cy, noteId, chainLength, relatedKeys);
      applyStandaloneGraphDim(cy, true);
      notifyHighlight();
    };
    function renderRelatedPanel() {
      if (!relatedEl) return;
      if (!focusedId) {
        relatedEl.innerHTML = "";
        return;
      }
      const groups = collectRelatedEdgeLabelEntries(focusedId, connections, chainLength);
      const flat = flattenRelatedEdgeLabelGroups(groups);
      const total = flat.length;
      const selectedCount = flat.reduce((n, e) => n + (relatedKeys.has(e.key) ? 1 : 0), 0);
      const colHtml = (title, column, entries) => {
        const allOn = entries.length > 0 && entries.every((e) => relatedKeys.has(e.key));
        const rows = entries.length === 0 ? `<p class="text-[11px] text-gray-400">\u2014</p>` : `<ul class="space-y-0.5">${entries.map((entry) => {
          const checked = relatedKeys.has(entry.key);
          return `<li>
                  <label class="flex cursor-pointer items-center gap-1.5 py-0.5 text-left text-xs ${checked ? "text-gray-800" : "text-gray-400"}">
                    <input type="checkbox" data-rel-key="${encodeURIComponent(entry.key)}" ${checked ? "checked" : ""} class="h-3.5 w-3.5 shrink-0 rounded border-gray-300" style="accent-color:${escapeHtml(themeColor)}" />
                    <span class="min-w-0 flex-1 truncate font-medium" title="${escapeHtml(entry.label)}">${escapeHtml(entry.label)}</span>
                    <span class="shrink-0 tabular-nums text-[10px] text-gray-400">${entry.count}</span>
                  </label>
                </li>`;
        }).join("")}</ul>`;
        return `<div class="min-w-0 flex-1">
        <div class="mb-1.5 flex items-center justify-between gap-1">
          <div class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">${title}</div>
          ${entries.length > 0 ? `<button type="button" data-rel-col="${column}" class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="${allOn ? `\u9690\u85CF\u5168\u90E8 ${title}` : `\u663E\u793A\u5168\u90E8 ${title}`}">${eyeSvg(allOn)}</button>` : ""}
        </div>
        ${rows}
      </div>`;
      };
      relatedEl.innerHTML = `
      <div class="relative w-72 sm:w-80 shrink-0 pointer-events-auto" style="filter:drop-shadow(0 25px 50px rgb(0 0 0 / 0.15))">
        <div data-allow-context-menu class="relative rounded-2xl border border-gray-100/80 overflow-hidden flex flex-col map-chrome-surface" style="max-height:min(40vh,22rem)">
        <div class="shrink-0 flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
          <div class="min-w-0 flex-1">
            <div class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">\u5173\u8054</div>
            <div class="truncate text-sm font-semibold text-gray-900">
              \u9AD8\u4EAE\u7B5B\u9009
              ${total > 0 ? `<span class="ml-1 font-medium text-gray-400">${selectedCount}/${total}</span>` : ""}
            </div>
          </div>
          ${total > 0 ? `<span class="flex shrink-0 gap-1">
                  <button type="button" data-rel-all class="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800">\u5168\u9009</button>
                  <button type="button" data-rel-none class="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800">\u6E05\u7A7A</button>
                </span>` : ""}
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          ${total === 0 ? `<p class="text-xs text-gray-400">\u5F53\u524D\u5173\u7CFB\u94FE\u5185\u6682\u65E0\u8FDE\u7EBF\u3002</p>` : `<div class="flex gap-4">
                  ${colHtml("From", "from", groups.from)}
                  <div class="w-px shrink-0 self-stretch bg-gray-100" aria-hidden="true"></div>
                  ${colHtml("To", "to", groups.to)}
                </div>`}
        </div>
        </div>
      </div>`;
      relatedEl.querySelectorAll("input[data-rel-key]").forEach((input) => {
        input.addEventListener("change", () => {
          const raw = input.getAttribute("data-rel-key") || "";
          let key = "";
          try {
            key = decodeURIComponent(raw);
          } catch {
            key = raw;
          }
          if (!key) return;
          if (input.checked) relatedKeys.add(key);
          else relatedKeys.delete(key);
          applyFocusHighlight(focusedId);
          renderRelatedPanel();
        });
      });
      relatedEl.querySelectorAll("button[data-rel-col]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const col = btn.getAttribute("data-rel-col");
          if (col !== "from" && col !== "to") return;
          const entries = col === "from" ? groups.from : groups.to;
          const keys = entries.map((x) => x.key);
          const allOn = keys.length > 0 && keys.every((k) => relatedKeys.has(k));
          if (allOn) keys.forEach((k) => relatedKeys.delete(k));
          else keys.forEach((k) => relatedKeys.add(k));
          applyFocusHighlight(focusedId);
          renderRelatedPanel();
        });
      });
      relatedEl.querySelector("button[data-rel-all]")?.addEventListener("click", (e) => {
        e.stopPropagation();
        relatedKeys = new Set(flat.map((x) => x.key));
        applyFocusHighlight(focusedId);
        renderRelatedPanel();
      });
      relatedEl.querySelector("button[data-rel-none]")?.addEventListener("click", (e) => {
        e.stopPropagation();
        relatedKeys = /* @__PURE__ */ new Set();
        applyFocusHighlight(focusedId);
        renderRelatedPanel();
      });
    }
    function renderPreview() {
      if (!previewEl) return;
      const id = hoverId || focusedId;
      if (!id) {
        previewEl.classList.add("hidden");
        previewEl.innerHTML = "";
        return;
      }
      const p = previews[id];
      if (!p) {
        previewEl.classList.add("hidden");
        previewEl.innerHTML = "";
        return;
      }
      if (previewImgIdx < 0) previewImgIdx = 0;
      const imgs = [...p.images || []];
      if (p.sketch) imgs.push(p.sketch);
      if (previewImgIdx >= imgs.length) previewImgIdx = 0;
      const timeRange = p.startYear != null ? p.endYear != null && p.endYear !== p.startYear ? `${p.startYear}\u2013${p.endYear}` : String(p.startYear) : "";
      let detailHtml = "";
      if (p.previewDetailMd.trim()) {
        try {
          detailHtml = marked?.parse(p.previewDetailMd) ?? escapeHtml(p.previewDetailMd).replace(/\n/g, "<br/>");
        } catch {
          detailHtml = escapeHtml(p.previewDetailMd).replace(/\n/g, "<br/>");
        }
        detailHtml = withExternalMarkdownLinks(String(detailHtml));
      }
      const imgSection = imgs.length > 0 ? `<div class="relative flex items-center justify-center shrink-0 px-4 py-3 bg-transparent">
            <img src="${escapeHtml(imgs[previewImgIdx])}" class="w-full max-h-64 object-contain" style="filter:drop-shadow(0 8px 18px rgba(15,23,42,0.28))" alt="" />
            ${imgs.length > 1 ? `<button type="button" class="km-g-prev absolute left-2 p-1.5 bg-black/30 text-white rounded-full">\u2039</button>
                   <button type="button" class="km-g-next absolute right-2 p-1.5 bg-black/30 text-white rounded-full">\u203A</button>` : ""}
          </div>` : "";
      previewEl.classList.remove("hidden");
      previewEl.innerHTML = `
      <div class="relative w-72 sm:w-80 shrink-0 pointer-events-auto" style="filter:drop-shadow(0 25px 50px rgb(0 0 0 / 0.15))">
        <div data-allow-context-menu class="relative rounded-2xl border border-gray-100/80 overflow-hidden flex flex-col map-chrome-surface" style="max-height:min(52vh,28rem)">
        <div class="p-4 pb-2 flex items-start justify-between gap-3 border-b border-gray-100 shrink-0">
          <div class="flex items-start gap-3 flex-1 min-w-0">
            ${p.emoji ? `<span class="text-2xl mt-0.5 shrink-0">${escapeHtml(p.emoji)}</span>` : ""}
            <div class="min-w-0 flex-1">
              <h3 class="text-lg font-bold text-gray-900 leading-tight whitespace-pre-line break-words">${escapeHtml(p.previewTitle)}</h3>
              ${timeRange ? `<div class="mt-1 text-xs text-gray-500 font-medium truncate">${escapeHtml(timeRange)}</div>` : ""}
            </div>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto text-sm min-h-0">
          ${detailHtml ? `<div class="px-4 py-3 text-gray-800 leading-snug break-words border-b border-gray-50 bg-gray-50/30 mapping-preview-markdown">${detailHtml}</div>` : ""}
          ${imgSection}
        </div>
        </div>
      </div>`;
      const prev = previewEl.querySelector(".km-g-prev");
      const next = previewEl.querySelector(".km-g-next");
      prev?.addEventListener("click", (e) => {
        e.stopPropagation();
        previewImgIdx = (previewImgIdx - 1 + imgs.length) % imgs.length;
        renderPreview();
      });
      next?.addEventListener("click", (e) => {
        e.stopPropagation();
        previewImgIdx = (previewImgIdx + 1) % imgs.length;
        renderPreview();
      });
    }
    const clearFocus = () => {
      focusedId = null;
      relatedKeys = /* @__PURE__ */ new Set();
      applyFocusHighlight(null);
      renderRelatedPanel();
      renderPreview();
    };
    cy.on("mouseover", "node", (evt) => {
      const n = evt.target;
      if (n.hasClass?.("frame-cluster-label") || n.hasClass?.("frame-cluster-halo")) return;
      hoverId = n.id();
      previewImgIdx = 0;
      applyGraphHoverHighlight(cy, hoverId);
      notifyHighlight();
      renderPreview();
    });
    cy.on("mouseout", "node", () => {
      hoverId = null;
      applyGraphHoverHighlight(cy, null);
      notifyHighlight();
      renderPreview();
    });
    cy.on("tap", "node", (evt) => {
      cy.elements().unselect();
      const n = evt.target;
      if (n.hasClass?.("frame-cluster-label") || n.hasClass?.("frame-cluster-halo")) return;
      const id = n.id();
      if (focusedId === id) {
        clearFocus();
        return;
      }
      focusedId = id;
      const groups = collectRelatedEdgeLabelEntries(id, connections, chainLength);
      relatedKeys = new Set(flattenRelatedEdgeLabelGroups(groups).map((e) => e.key));
      previewImgIdx = 0;
      applyFocusHighlight(id);
      applyGraphHoverHighlight(cy, hoverId);
      renderRelatedPanel();
      renderPreview();
    });
    cy.on("tap", "edge", () => {
      cy.elements().unselect();
      clearFocus();
    });
    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        cy.elements().unselect();
        clearFocus();
      }
    });
    const focusNote = (noteId) => {
      const n = cy.getElementById(noteId);
      if (n.empty() || !n.isNode()) return;
      if (n.hasClass?.("frame-cluster-label") || n.hasClass?.("frame-cluster-halo")) return;
      cy.elements().unselect();
      focusedId = noteId;
      const groups = collectRelatedEdgeLabelEntries(noteId, connections, chainLength);
      relatedKeys = new Set(flattenRelatedEdgeLabelGroups(groups).map((e) => e.key));
      previewImgIdx = 0;
      applyFocusHighlight(noteId);
      applyGraphHoverHighlight(cy, hoverId);
      renderRelatedPanel();
      renderPreview();
    };
    return { focusNote, clearFocus };
  }

  // utils/graph/graphData.ts
  var DEFAULT_NOTE_WEIGHT = 1;
  function clampNoteWeight(raw) {
    const w = Number(raw);
    if (!Number.isFinite(w) || w <= 0) return DEFAULT_NOTE_WEIGHT;
    return Math.round(Math.max(0.1, Math.min(10, w)) * 10) / 10;
  }
  var GRAPH_NODE_SIZE_MAX_PX = 36;
  function graphNodeSizeFromDegree(degree, maxDegree, minSize) {
    const minS = Math.min(GRAPH_NODE_SIZE_MAX_PX, Math.max(1, minSize));
    const maxS = GRAPH_NODE_SIZE_MAX_PX;
    if (maxS <= minS || maxDegree <= 0 || !(degree > 0)) return minS;
    const t = Math.max(0, Math.min(1, degree / maxDegree));
    const eased = Math.pow(t, 0.65);
    return Math.round((minS + (maxS - minS) * eased) * 100) / 100;
  }
  function graphNodeSizeWithWeight(baseSize, rawWeight) {
    const weight = clampNoteWeight(rawWeight);
    const weighted = baseSize + Math.log10(weight) * 8;
    return Math.round(Math.max(1, Math.min(GRAPH_NODE_SIZE_MAX_PX, weighted)) * 100) / 100;
  }
  var DEFAULT_GRAPH_STYLESHEET_SIZING = {
    nodeSize: 28,
    labelFontPx: 10,
    edgeWeight: 0.3,
    edgeLabelFontPx: 6
  };
  var GRAPH_HIGHLIGHT_LABEL_SCREEN_PX = 16;
  var GRAPH_HIGHLIGHT_RELATED_LABEL_SCREEN_PX = 12;
  var GRAPH_FOCUS_CORE_NODE_SCALE = 1.5;
  function mergeGraphSizing(partial) {
    const o = { ...DEFAULT_GRAPH_STYLESHEET_SIZING };
    if (partial?.nodeSize != null && Number.isFinite(partial.nodeSize)) {
      o.nodeSize = Math.min(36, Math.max(1, partial.nodeSize));
    }
    if (partial?.labelFontPx != null && Number.isFinite(partial.labelFontPx)) {
      o.labelFontPx = Math.min(16, Math.max(4, partial.labelFontPx));
    }
    if (partial?.edgeWeight != null && Number.isFinite(partial.edgeWeight)) {
      o.edgeWeight = Math.min(4, Math.max(0.1, Math.round(partial.edgeWeight * 10) / 10));
    }
    if (partial?.edgeLabelFontPx != null && Number.isFinite(partial.edgeLabelFontPx)) {
      o.edgeLabelFontPx = Math.min(16, Math.max(3, Math.round(partial.edgeLabelFontPx)));
    }
    return o;
  }
  function graphSizingCss(themeColor, s) {
    const ns = s.nodeSize;
    const nf = s.labelFontPx;
    const ew = s.edgeWeight;
    const ewNorm = (Math.max(0.1, ew) - 0.1) / 0.9;
    const px = (n) => `${n}px`;
    const pad = Math.max(4, Math.round(nf * 0.8));
    const refNs = DEFAULT_GRAPH_STYLESHEET_SIZING.nodeSize;
    const baseGap = Math.max(4, Math.round(nf * 0.8));
    const marginY = Math.max(2, Math.round(ns / refNs * baseGap));
    const coreScale = GRAPH_FOCUS_CORE_NODE_SCALE;
    const nsCore = Math.round(ns * coreScale * 100) / 100;
    const favScale = 1.5;
    const favNs = ns * favScale;
    const favNf = nf * favScale;
    const padFav = Math.max(4, Math.round(favNf * 0.8));
    const baseGapFav = Math.max(4, Math.round(favNf * 0.8));
    const marginYFav = Math.max(2, Math.round(favNs / refNs * baseGapFav));
    const favNsCore = Math.round(favNs * coreScale * 100) / 100;
    const marginYCore = Math.max(2, Math.round(marginY * coreScale));
    const marginYFavCore = Math.max(2, Math.round(marginYFav * coreScale));
    const borderBase = Math.max(0.2, Math.min(0.6, Math.round(ns * 0.071 * (0.1 + 0.2 * ewNorm) * 100) / 100));
    const borderBaseFav = Math.max(
      0.2,
      Math.min(0.6, Math.round(favNs * 0.071 * (0.1 + 0.2 * ewNorm) * 100) / 100)
    );
    const borderNh = Math.max(3, Math.min(8, Math.round(ns * 0.11)));
    const borderNhFav = Math.max(3, Math.min(8, Math.round(favNs * 0.11)));
    const borderCore = Math.max(4, Math.min(10, Math.round(ns * 0.14)));
    const borderCoreFav = Math.max(4, Math.min(10, Math.round(favNs * 0.14)));
    const borderSel = Math.max(3, Math.min(8, Math.round(ns * 0.11)));
    const borderSelFav = Math.max(3, Math.min(8, Math.round(favNs * 0.11)));
    const edgeLine = Math.max(0.4, Math.min(4.6, Math.round((0.4 + ewNorm * 2.8) * 100) / 100));
    const edgeFontScaled = Math.max(3, Math.min(16, s.edgeLabelFontPx));
    const edgeMarginY = Math.max(2, Math.round(edgeFontScaled * 0.72));
    const edgeOutline = Math.max(0.6, Math.min(1.4, Math.round((0.6 + ewNorm * 0.8) * 100) / 100));
    const edgeOutlineHighlight = Math.max(2.8, Math.min(5.6, edgeFontScaled * 0.7));
    const edgeLineFocus = Math.max(0.8, Math.min(6.6, Math.round(edgeLine * 1.35 * 100) / 100));
    const edgeLineHi = Math.max(0.8, Math.min(9.2, Math.round(edgeLine * 1.85 * 100) / 100));
    const vpEdgeOff = Math.max(48, Math.round(ns * 3.2));
    return {
      ns,
      favNs,
      nf,
      favNf,
      px,
      pad,
      padFav,
      marginY,
      marginYFav,
      nsCore,
      favNsCore,
      marginYCore,
      marginYFavCore,
      borderBase,
      borderBaseFav,
      borderNh,
      borderNhFav,
      borderCore,
      borderCoreFav,
      borderSel,
      borderSelFav,
      edgeLine,
      edgeLineFocus,
      edgeLineHi,
      edgeFont: edgeFontScaled,
      edgeMarginY,
      edgeOutline,
      edgeOutlineHighlight,
      vpEdgeOff,
      themeColor
    };
  }
  function getGraphStylesheet(themeColor, sizingPartial, _chrome, opts) {
    const sizing = mergeGraphSizing(sizingPartial);
    const z = graphSizingCss(themeColor, sizing);
    const edgeCurveOn = opts?.edgeCurve !== false;
    const curveStyle = edgeCurveOn ? "unbundled-bezier" : "straight";
    return [
      {
        selector: "node",
        style: {
          /** 标题由 HTML overlay 绘制；节点 canvas label 只画圆内 Emoji。 */
          label: "data(emoji)",
          "background-color": "data(color)",
          // 交互命中区域：略外扩，减少贴边时误点到连线
          "bounds-expansion": 4,
          color: "#111827",
          "text-valign": "center",
          "text-halign": "center",
          "text-margin-y": 0,
          "font-size": "data(nodeEmojiSize)",
          "font-family": "Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif",
          "font-weight": "400",
          "line-height": 1,
          width: "data(nodeSize)",
          height: "data(nodeSize)",
          "border-width": z.borderBase,
          "border-color": "#ffffff",
          "text-opacity": 1,
          "text-background-opacity": 0,
          "text-border-width": 0,
          /**
           * 普通节点留在 auto 层（z > 普通边），避免挡住高亮连线（高亮边在 top）。
           * 高亮节点单独抬到 top。
           */
          "z-compound-depth": "auto",
          "z-index-compare": "manual",
          "z-index": 100
        }
      },
      {
        selector: 'node[graphLinked = "no"]',
        style: {
          opacity: 0.42
        }
      },
      {
        selector: 'node[favorite = "yes"]',
        style: {
          "font-size": "data(nodeEmojiSizeFav)",
          width: "data(nodeSizeFav)",
          height: "data(nodeSizeFav)",
          "border-width": z.borderBaseFav
        }
      },
      {
        selector: "node:selected",
        style: {
          opacity: 1,
          "border-width": z.borderSel,
          "border-color": z.themeColor
        }
      },
      {
        selector: 'node:selected[favorite = "yes"]',
        style: {
          opacity: 1,
          "border-width": z.borderSelFav,
          "border-color": z.themeColor
        }
      },
      /** 与选中点相连：节点描边高亮；标题由 HTML chrome 层绘制，Emoji 保留在圆内。 */
      {
        selector: "node.focus-nh",
        style: {
          "border-width": z.borderNh,
          "border-color": z.themeColor,
          opacity: 1,
          "text-background-opacity": 0,
          "text-border-width": 0,
          "z-compound-depth": "top",
          "z-index-compare": "manual",
          "z-index": 200
        }
      },
      {
        selector: 'node.focus-nh[favorite = "yes"]',
        style: {
          "border-width": z.borderNhFav,
          "font-size": "data(nodeEmojiSizeFav)"
        }
      },
      /** 选中边时两端便签 */
      {
        selector: "node.focus-edge-endpoint",
        style: {
          "border-width": z.borderNh,
          "border-color": z.themeColor,
          opacity: 1,
          "text-background-opacity": 0,
          "text-border-width": 0,
          "z-compound-depth": "top",
          "z-index-compare": "manual",
          "z-index": 250
        }
      },
      {
        selector: 'node.focus-edge-endpoint[favorite = "yes"]',
        style: {
          "border-width": z.borderNhFav,
          "font-size": "data(nodeEmojiSizeFav)"
        }
      },
      /** 选中（焦点中心）：标题由 HTML chrome 层绘制，Emoji 随圆放大。 */
      {
        selector: "node.focus-core",
        style: {
          opacity: 1,
          width: "data(nodeSizeCore)",
          height: "data(nodeSizeCore)",
          "font-size": "data(nodeEmojiSizeCore)",
          "border-width": z.borderCore,
          "border-color": z.themeColor,
          "text-background-opacity": 0,
          "text-border-width": 0,
          "z-compound-depth": "top",
          "z-index-compare": "manual",
          "z-index": 300
        }
      },
      {
        selector: 'node.focus-core[favorite = "yes"]',
        style: {
          opacity: 1,
          width: "data(nodeSizeFavCore)",
          height: "data(nodeSizeFavCore)",
          "font-size": "data(nodeEmojiSizeFavCore)",
          "border-width": z.borderCoreFav,
          "font-weight": "400"
        }
      },
      /** 悬停节点：标题由 HTML chrome 层绘制，Emoji 保留在圆内。 */
      {
        selector: "node.focus-hover",
        style: {
          opacity: 1,
          "border-width": z.borderCore,
          "border-color": z.themeColor,
          "text-background-opacity": 0,
          "text-border-width": 0,
          "z-compound-depth": "top",
          "z-index-compare": "manual",
          "z-index": 400
        }
      },
      {
        selector: 'node.focus-hover[favorite = "yes"]',
        style: {
          opacity: 1,
          "border-width": z.borderCoreFav,
          "font-size": "data(nodeEmojiSizeFav)"
        }
      },
      {
        selector: "edge",
        style: {
          label: "data(label)",
          opacity: 0.4,
          "line-color": "#d1d5db",
          width: "data(edgeLineWidth)",
          "arrow-scale": "data(edgeArrowScale)",
          "curve-style": curveStyle,
          ...edgeCurveOn ? {
            // bundled bezier 在单边时会退回直线；unbundled + 距离控制点才能看到弧度
            "control-point-distances": "data(controlPointDistance)",
            "control-point-weights": 0.5
          } : {},
          "target-arrow-shape": "triangle",
          "target-arrow-color": "#d1d5db",
          "source-arrow-shape": "none",
          "font-size": z.px(z.edgeFont),
          "text-rotation": "autorotate",
          "text-margin-y": -z.edgeMarginY,
          color: "#9ca3af",
          /**
           * 普通连线：auto 层且 z 低于普通节点，点在节点上优先命中节点。
           */
          "z-compound-depth": "auto",
          "z-index": 1,
          "z-index-compare": "manual"
        }
      },
      {
        selector: 'edge[direction = "forward"]',
        style: {
          "source-arrow-shape": "none",
          "target-arrow-shape": "triangle"
        }
      },
      {
        selector: 'edge[direction = "backward"]',
        style: {
          "source-arrow-shape": "triangle",
          "target-arrow-shape": "none",
          "source-arrow-color": "#d1d5db"
        }
      },
      {
        selector: 'edge[direction = "both"]',
        style: {
          "source-arrow-shape": "triangle",
          "target-arrow-shape": "triangle",
          "source-arrow-color": "#d1d5db"
        }
      },
      {
        selector: 'edge[direction = "none"]',
        style: {
          "source-arrow-shape": "none",
          "target-arrow-shape": "none"
        }
      },
      {
        selector: "edge:selected",
        style: {
          opacity: 1,
          "line-color": z.themeColor,
          "target-arrow-color": z.themeColor,
          "source-arrow-color": z.themeColor,
          /** top：盖过未高亮节点/边；仍低于高亮节点（200+） */
          "z-compound-depth": "top",
          "z-index-compare": "manual",
          "z-index": 50
        }
      },
      {
        selector: "edge.focus-e",
        style: {
          opacity: 1,
          "line-color": z.themeColor,
          "target-arrow-color": z.themeColor,
          "source-arrow-color": z.themeColor,
          width: "data(edgeLineFocusWidth)",
          "arrow-scale": "data(edgeArrowScaleFocus)",
          "z-compound-depth": "top",
          "z-index-compare": "manual",
          "z-index": 50,
          "font-weight": "600",
          color: "#374151",
          "text-outline-width": z.edgeOutlineHighlight,
          "text-outline-color": "#ffffff",
          "text-outline-opacity": 1
        }
      },
      /** 悬停边：高于未高亮内容，低于高亮节点 */
      {
        selector: "edge.focus-edge-hover",
        style: {
          opacity: 1,
          "line-color": z.themeColor,
          "target-arrow-color": z.themeColor,
          "source-arrow-color": z.themeColor,
          width: "data(edgeLineHiWidth)",
          "arrow-scale": "data(edgeArrowScaleHi)",
          "z-compound-depth": "top",
          "z-index-compare": "manual",
          "z-index": 80,
          "font-weight": "600",
          color: "#374151",
          "text-outline-width": z.edgeOutlineHighlight,
          "text-outline-color": "#ffffff",
          "text-outline-opacity": 1
        }
      },
      /** 选中边：同悬停，盖过未高亮节点/边 */
      {
        selector: "edge.focus-edge-selected",
        style: {
          opacity: 1,
          "line-color": z.themeColor,
          "target-arrow-color": z.themeColor,
          "source-arrow-color": z.themeColor,
          width: "data(edgeLineHiWidth)",
          "arrow-scale": "data(edgeArrowScaleHi)",
          "z-compound-depth": "top",
          "z-index-compare": "manual",
          "z-index": 80,
          "font-weight": "600",
          color: "#374151",
          "text-outline-width": z.edgeOutlineHighlight,
          "text-outline-color": "#ffffff",
          "text-outline-opacity": 1
        }
      },
      /**
       * 仅一端在视口内时：主 label 改到屏内端（source-label / target-label），避免放大后中点在屏外。
       * 由 applyGraphEdgeLabelViewportPlacement 挂类 edge-lbl-vp-src | edge-lbl-vp-tgt。
       */
      {
        selector: "edge.focus-e.edge-lbl-vp-src, edge.focus-edge-hover.edge-lbl-vp-src, edge.focus-edge-selected.edge-lbl-vp-src",
        style: {
          label: "",
          "source-label": "data(label)",
          "target-label": "",
          /** 沿边远离 source 端（屏内可见节点），避免贴在节点旁 */
          "source-text-offset": z.vpEdgeOff,
          "source-text-rotation": "autorotate",
          "source-text-margin-y": -z.edgeMarginY,
          "font-size": z.px(z.edgeFont),
          "font-weight": "600",
          color: "#374151",
          "text-outline-width": z.edgeOutlineHighlight,
          "text-outline-color": "#ffffff",
          "text-outline-opacity": 1
        }
      },
      {
        selector: "edge.focus-e.edge-lbl-vp-tgt, edge.focus-edge-hover.edge-lbl-vp-tgt, edge.focus-edge-selected.edge-lbl-vp-tgt",
        style: {
          label: "",
          "source-label": "",
          "target-label": "data(label)",
          /** 沿边远离 target 端（屏内可见节点） */
          "target-text-offset": z.vpEdgeOff,
          "target-text-rotation": "autorotate",
          "target-text-margin-y": -z.edgeMarginY,
          "font-size": z.px(z.edgeFont),
          "font-weight": "600",
          color: "#374151",
          "text-outline-width": z.edgeOutlineHighlight,
          "text-outline-color": "#ffffff",
          "text-outline-opacity": 1
        }
      },
      {
        // 无标签节点直接隐藏：确保它们不参与渲染（含 label / 框）
        selector: 'node[tagGroup = ""]',
        style: {
          display: "none"
        }
      },
      {
        // 避免无标签节点“把边线留在画面上”
        selector: 'edge[edgeUntagged = "yes"]',
        style: {
          display: "none"
        }
      },
      {
        selector: "node.graph-layer-hidden",
        style: {
          display: "none"
        }
      },
      /** 有选中对象时（GraphView 会给未高亮元素挂 graph-dim 类）：在“原透明度基础上再 *0.5” */
      {
        selector: "node.graph-dim",
        style: {
          opacity: 0.5
        }
      },
      {
        selector: 'node[graphLinked = "no"].graph-dim',
        style: {
          opacity: 0.21
        }
      },
      {
        selector: "edge.graph-dim",
        style: {
          opacity: 0.2
        }
      },
      {
        selector: "edge.graph-layer-hidden",
        style: {
          display: "none"
        }
      }
    ];
  }
  function applyGraphHighlightLabelScreenSize(cy, sizingPartial, _chrome) {
    if (!cy || cy.destroyed?.()) return;
    const sizing = mergeGraphSizing(sizingPartial);
    const z = graphSizingCss("#000000", sizing);
    const zoom = Math.max(0.08, cy.zoom());
    const hiFontSel = GRAPH_HIGHLIGHT_LABEL_SCREEN_PX;
    const hiFontRel = GRAPH_HIGHLIGHT_RELATED_LABEL_SCREEN_PX;
    const snum = (n) => Math.round(n / zoom * 1e3) / 1e3;
    const edgeMetrics = (fontPx) => ({
      marginY: Math.max(2, Math.round(fontPx * 0.36)),
      outline: Math.max(2, fontPx * 0.28)
    });
    const selM = edgeMetrics(hiFontSel);
    const relM = edgeMetrics(hiFontRel);
    const nodeHi = "node.focus-nh, node.focus-edge-endpoint, node.focus-core, node.focus-hover";
    const edgeRel = "edge.focus-e";
    const edgeSel = "edge.focus-edge-hover, edge.focus-edge-selected";
    const edgeRelVpSrc = "edge.focus-e.edge-lbl-vp-src";
    const edgeSelVpSrc = "edge.focus-edge-hover.edge-lbl-vp-src, edge.focus-edge-selected.edge-lbl-vp-src";
    const edgeRelVpTgt = "edge.focus-e.edge-lbl-vp-tgt";
    const edgeSelVpTgt = "edge.focus-edge-hover.edge-lbl-vp-tgt, edge.focus-edge-selected.edge-lbl-vp-tgt";
    cy.style().selector(nodeHi).style({
      // Cytoscape 的 node label 现在只承载圆内 Emoji；高亮时仍须保持可见。
      "text-opacity": 1,
      "text-background-opacity": 0,
      "text-border-width": 0
    }).selector(edgeRel).style({
      "font-size": snum(hiFontRel),
      "text-outline-width": snum(relM.outline),
      "text-margin-y": snum(-relM.marginY)
    }).selector(edgeSel).style({
      "font-size": snum(hiFontSel),
      "text-outline-width": snum(selM.outline),
      "text-margin-y": snum(-selM.marginY)
    }).selector(edgeRelVpSrc).style({
      "font-size": snum(hiFontRel),
      "text-outline-width": snum(relM.outline),
      "source-text-offset": snum(z.vpEdgeOff),
      "source-text-margin-y": snum(-relM.marginY)
    }).selector(edgeSelVpSrc).style({
      "font-size": snum(hiFontSel),
      "text-outline-width": snum(selM.outline),
      "source-text-offset": snum(z.vpEdgeOff),
      "source-text-margin-y": snum(-selM.marginY)
    }).selector(edgeRelVpTgt).style({
      "font-size": snum(hiFontRel),
      "text-outline-width": snum(relM.outline),
      "target-text-offset": snum(z.vpEdgeOff),
      "target-text-margin-y": snum(-relM.marginY)
    }).selector(edgeSelVpTgt).style({
      "font-size": snum(hiFontSel),
      "text-outline-width": snum(selM.outline),
      "target-text-offset": snum(z.vpEdgeOff),
      "target-text-margin-y": snum(-selM.marginY)
    }).update();
  }

  // utils/graph/graphHighlightChromeLabels.ts
  var REF_NODE_SIZE = 28;
  var HI_FONT_SEL_PX = GRAPH_HIGHLIGHT_LABEL_SCREEN_PX;
  var HI_FONT_REL_PX = GRAPH_HIGHLIGHT_RELATED_LABEL_SCREEN_PX;
  var GRAPH_HIGHLIGHT_CHROME_LABEL_MAX_WIDTH_CSS = "min(280px, 70vw)";
  function highlightTier(n) {
    if (n.hasClass("focus-hover")) return 4;
    if (n.hasClass("focus-core")) return 3;
    if (n.hasClass("focus-edge-endpoint")) return 2;
    if (n.hasClass("focus-nh")) return 1;
    return 0;
  }
  function highlightFontPx(n) {
    if (n.hasClass("focus-hover") || n.hasClass("focus-core")) return HI_FONT_SEL_PX;
    return HI_FONT_REL_PX;
  }
  function splitTitleAndYear(n) {
    const year = String(n.data("year") ?? "").trim();
    const raw = String(n.data("label") ?? "").trim();
    if (!raw) return { title: "", year };
    if (!year) return { title: raw, year: "" };
    const sep = "\u2003\u2003";
    if (raw.includes(sep)) {
      return { title: raw.split(sep)[0]?.trim() ?? raw, year };
    }
    if (raw.endsWith(year)) {
      return {
        title: raw.slice(0, -year.length).replace(/\u2003+$/g, "").trim(),
        year
      };
    }
    return { title: raw, year };
  }
  function charsOf(s) {
    return Array.from(s);
  }
  function tokenizeForWrap(text) {
    return text.match(/[0-9]+|[A-Za-z]+|\s+|./gu) ?? [];
  }
  function greedyWrap(text, maxPx, measure) {
    if (!text) return [];
    const tokens = tokenizeForWrap(text);
    const lines = [];
    let cur = "";
    const flush = () => {
      if (!cur) return;
      lines.push(cur);
      cur = "";
    };
    for (const tok of tokens) {
      const isSpace = /^\s+$/.test(tok);
      const next = cur + tok;
      if (!cur || measure(next) <= maxPx) {
        cur = next;
        continue;
      }
      flush();
      if (isSpace) continue;
      cur = tok;
      if (measure(cur) > maxPx) {
        flush();
      }
    }
    flush();
    return lines;
  }
  function wrapTitleLines(title, maxContentPx, year, yearGapPx, measure) {
    if (!title) return [];
    const yearW = year ? measure(year) : 0;
    const lastAvail = year ? Math.max(24, maxContentPx - yearW - yearGapPx) : maxContentPx;
    let lines = greedyWrap(title, maxContentPx, measure);
    if (year && lines.length > 0) {
      const last = lines.pop();
      if (measure(last) <= lastAvail) {
        lines.push(last);
      } else {
        lines.push(...greedyWrap(last, lastAvail, measure));
      }
    }
    while (lines.length >= 2 && charsOf(lines[lines.length - 1]).length === 1) {
      const orphan = lines.pop();
      const prev = lines.pop();
      const merged = prev + orphan;
      if (year && measure(merged) > lastAvail) {
        lines.push(merged);
        lines.push("");
        break;
      }
      lines.push(merged);
    }
    while (lines.length >= 2 && lines[lines.length - 1] !== "" && charsOf(lines[lines.length - 1]).length === 1) {
      const orphan = lines.pop();
      lines[lines.length - 1] = lines[lines.length - 1] + orphan;
    }
    return lines;
  }
  function resolveMaxContentPx(padPx) {
    const hostW = typeof window !== "undefined" ? Math.min(280, window.innerWidth * 0.7) : 280;
    return Math.max(48, hostW - padPx * 2);
  }
  function collectGraphHighlightChromeLabels(cy, nodeSize, themeColor, idleLabelFontPx = 10) {
    const out = [];
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const ctx = canvas?.getContext("2d") ?? null;
    const idleFont = Math.min(16, Math.max(4, Math.round(idleLabelFontPx)));
    const zoom = Math.max(1e-6, cy.zoom());
    let hasHighlight = false;
    cy.nodes().forEach((n) => {
      if (n.hasClass("frame-cluster-label") || n.hasClass("frame-cluster-halo")) return;
      if (highlightTier(n) > 0) hasHighlight = true;
    });
    cy.nodes().forEach((n) => {
      if (n.hasClass("frame-cluster-label") || n.hasClass("frame-cluster-halo")) return;
      if (n.style("display") === "none") return;
      const tier = highlightTier(n);
      if (hasHighlight && tier === 0) return;
      const { title, year } = splitTitleAndYear(n);
      if (!title && !year) return;
      const fav = n.data("favorite") === "yes";
      const baseNsRaw = Number(n.data("nodeSize"));
      const baseNs = Number.isFinite(baseNsRaw) && baseNsRaw > 0 ? baseNsRaw : nodeSize;
      const ns = baseNs * (fav ? 1.5 : 1);
      const isHighlight = tier > 0;
      const fontPx = isHighlight ? highlightFontPx(n) : idleFont;
      const baseGap = Math.max(4, Math.round(fontPx * 0.8));
      const marginY = Math.max(2, Math.round(baseNs / REF_NODE_SIZE * baseGap));
      const padPx = isHighlight ? Math.max(1, Math.round(fontPx * 0.2)) : 0;
      const gap = Math.max(2, Math.round(marginY * (fav ? 1.5 : 1)));
      const fontWeight = fav ? 700 : isHighlight ? 500 : 600;
      const maxContentPx = resolveMaxContentPx(Math.max(1, padPx || Math.round(fontPx * 0.2)));
      if (ctx) {
        ctx.font = `${fontWeight} ${fontPx}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      }
      const measure = (s) => ctx ? ctx.measureText(s).width : s.length * fontPx * 0.9;
      const yearGapPx = 10;
      const lines = wrapTitleLines(title, maxContentPx, year, yearGapPx, measure);
      const multiLine = lines.length > 1 || year !== "" && lines.length >= 1 && measure(`${lines[0] ?? ""}`) + (year ? yearGapPx + measure(year) : 0) > maxContentPx;
      const rp = n.renderedPosition();
      const half = ns * zoom / 2;
      out.push({
        id: n.id(),
        title,
        year,
        lines: lines.length ? lines : title ? [title] : [""],
        left: rp.x,
        top: rp.y + half + gap,
        fontPx,
        color: isHighlight ? fav ? themeColor : "#000000" : "#9ca3af",
        fontWeight,
        padPx,
        z: isHighlight ? 10 + tier : 1,
        maxContentPx,
        multiLine,
        chrome: isHighlight,
        // 空闲：仅视觉随 zoom 缩放，换行仍按未缩放字号
        zoomScale: isHighlight ? 1 : zoom
      });
    });
    return out;
  }
  function graphHighlightChromePaintKey(items) {
    return items.map(
      (it) => `${it.id}:${Math.round(it.left)}:${Math.round(it.top)}:${it.fontPx}:${it.zoomScale.toFixed(3)}:${it.lines.join("/")}:${it.year}:${it.multiLine ? 1 : 0}:${it.chrome ? 1 : 0}:${it.color}`
    ).join("|");
  }
  function buildGraphHighlightChromeLabelContent(it) {
    const root = document.createElement("div");
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.gap = "2px";
    root.style.width = "100%";
    root.style.maxWidth = `${it.maxContentPx}px`;
    root.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const lines = it.lines;
    const year = it.year;
    const hasYear = year !== "";
    const appendYearRow = (titlePart) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "baseline";
      row.style.gap = "10px";
      row.style.width = "100%";
      row.style.textAlign = "left";
      const left = document.createElement("span");
      left.textContent = titlePart;
      left.style.textAlign = "left";
      left.style.minWidth = "0";
      left.style.flex = "1 1 auto";
      left.style.whiteSpace = "nowrap";
      row.appendChild(left);
      if (hasYear) {
        const right = document.createElement("span");
        right.textContent = year;
        right.style.flexShrink = "0";
        right.style.textAlign = "right";
        right.style.whiteSpace = "nowrap";
        row.appendChild(right);
      }
      root.appendChild(row);
    };
    if (!it.multiLine && !hasYear) {
      root.style.textAlign = "center";
      root.textContent = lines[0] ?? it.title;
      return root;
    }
    if (!it.multiLine && hasYear) {
      appendYearRow(lines[0] ?? it.title);
      return root;
    }
    const body = lines.slice(0, -1);
    const lastTitle = lines[lines.length - 1] ?? "";
    for (const line of body) {
      const row = document.createElement("div");
      row.style.textAlign = "left";
      row.style.width = "100%";
      row.style.whiteSpace = "nowrap";
      row.textContent = line;
      root.appendChild(row);
    }
    appendYearRow(lastTitle);
    return root;
  }
  function paintGraphHighlightChromeLabels(layer, items, chromeOpacity, chromeBlurPx) {
    const chromeStyle = mapChromeSurfaceStyle(chromeOpacity, chromeBlurPx);
    const frag = document.createDocumentFragment();
    const ordered = [...items].sort((a, b) => a.z - b.z);
    for (const it of ordered) {
      const el = document.createElement("div");
      el.className = it.chrome ? `${MAP_CHROME_SURFACE_SHELL_CLASS} absolute leading-snug` : "absolute leading-snug";
      el.appendChild(buildGraphHighlightChromeLabelContent(it));
      const style = {
        left: `${it.left}px`,
        top: `${it.top}px`,
        transform: `translateX(-50%) scale(${it.zoomScale})`,
        transformOrigin: "50% 0",
        padding: `${it.padPx}px`,
        fontSize: `${it.fontPx}px`,
        fontWeight: String(it.fontWeight),
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: it.color,
        zIndex: String(it.z),
        maxWidth: GRAPH_HIGHLIGHT_CHROME_LABEL_MAX_WIDTH_CSS,
        pointerEvents: "none",
        position: "absolute"
      };
      if (it.chrome) {
        style.backgroundColor = String(chromeStyle.backgroundColor ?? "");
        style.backdropFilter = String(chromeStyle.backdropFilter ?? "");
        style.WebkitBackdropFilter = String(
          chromeStyle.WebkitBackdropFilter ?? ""
        );
      }
      Object.assign(el.style, style);
      frag.appendChild(el);
    }
    layer.replaceChildren(frag);
  }
  function wireStandaloneHighlightChromeLabels(cy, layer, opts) {
    let raf = null;
    let lastKey = "";
    const sync = () => {
      raf = null;
      if (!cy || cy.destroyed?.()) {
        if (lastKey !== "") {
          lastKey = "";
          layer.replaceChildren();
        }
        return;
      }
      const items = collectGraphHighlightChromeLabels(
        cy,
        opts.nodeSize,
        opts.themeColor,
        opts.labelFontPx ?? 10
      );
      const key = graphHighlightChromePaintKey(items);
      if (key === lastKey) return;
      lastKey = key;
      paintGraphHighlightChromeLabels(layer, items, opts.chromeOpacity, opts.chromeBlurPx);
    };
    const schedule = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(sync);
    };
    const forceRefresh = () => {
      lastKey = "";
      schedule();
    };
    sync();
    cy.on("viewport", schedule);
    cy.on("drag", "node", schedule);
    cy.on("free", "node", schedule);
    cy.on("layoutstop", schedule);
    const host = opts.host ?? layer.parentElement;
    const ro = host && typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (host && ro) ro.observe(host);
    return forceRefresh;
  }

  // utils/graph/graphPresets.ts
  function isDecorNode(cy, id) {
    const n = cy.getElementById(id);
    if (n.empty() || !n.isNode()) return true;
    return n.hasClass("frame-cluster-label") || n.hasClass("frame-cluster-halo");
  }
  function normalizeHiddenList(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((h) => String(h).trim()).filter(Boolean);
  }
  function applyGraphViewPresetToCy(cy, preset) {
    cy.batch(() => {
      for (const [id, pos] of Object.entries(preset.positions ?? {})) {
        if (isDecorNode(cy, id)) continue;
        const n = cy.getElementById(id);
        if (n.empty() || !n.isNode()) continue;
        if (typeof pos?.x === "number" && typeof pos?.y === "number" && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
          n.position({ x: pos.x, y: pos.y });
        }
      }
      for (const [id, color] of Object.entries(preset.nodeColors ?? {})) {
        if (isDecorNode(cy, id)) continue;
        const n = cy.getElementById(id);
        if (n.empty() || !n.isNode()) continue;
        const c = String(color ?? "").trim();
        if (c) n.data("color", c);
      }
      if (preset.layerItemHidden) {
        for (const [id, hidden] of Object.entries(preset.layerItemHidden)) {
          if (isDecorNode(cy, id)) continue;
          const n = cy.getElementById(id);
          if (n.empty() || !n.isNode()) continue;
          n.data("layerItemHidden", Boolean(hidden));
        }
      }
    });
  }
  function applyGraphViewPresetVisibility(cy, preset) {
    if (preset.tagHidden == null && preset.frameHidden == null) return;
    applyGraphDualLayerNodeVisibility(
      cy,
      normalizeHiddenList(preset.tagHidden),
      normalizeHiddenList(preset.frameHidden),
      preset.tagVisibilityLogic === "and" ? "and" : "or"
    );
  }

  // utils/graph/graphStandaloneChrome.ts
  function escapeHtml2(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function setBtnActive(btn, active, themeColor) {
    if (!btn) return;
    if (active) {
      btn.style.backgroundColor = themeColor;
      btn.style.backdropFilter = "none";
      btn.style.webkitBackdropFilter = "none";
      btn.classList.add("text-white");
      btn.classList.remove("text-gray-700");
    } else {
      btn.style.backgroundColor = "";
      btn.style.backdropFilter = "";
      btn.style.webkitBackdropFilter = "";
      btn.classList.remove("text-white");
      btn.classList.add("text-gray-700");
    }
  }
  function applyChromeCssVars(chrome) {
    const root = document.documentElement;
    const o = Math.min(1, Math.max(0, chrome.opacity));
    const b = Math.min(48, Math.max(0, chrome.blurPx));
    root.style.setProperty("--map-ui-chrome-opacity", String(o));
    root.style.setProperty("--map-ui-chrome-blur-px", b === 0 ? "0px" : `${b}px`);
  }
  function renderLegendItems(items, labelFontPx) {
    const host = document.getElementById("graph-node-legend");
    if (!host) return;
    if (!items || items.length === 0) {
      host.innerHTML = "";
      host.classList.add("hidden");
      return;
    }
    host.classList.remove("hidden");
    const swatch = Math.max(6, Math.round(labelFontPx * 0.9));
    const shown = items.slice(0, 8);
    const rows = shown.map((item) => {
      const dots = (item.colors ?? []).slice(0, 3).map(
        (c) => `<span class="inline-block rounded-full border border-white/90 shadow-sm shrink-0" style="background-color:${escapeHtml2(c)};width:${swatch}px;height:${swatch}px"></span>`
      ).join("");
      return `<div class="flex items-center gap-2">
        <div class="flex items-center gap-1.5">${dots}</div>
        <span class="text-gray-500 font-medium truncate" style="font-size:${labelFontPx}px">${escapeHtml2(item.label)}</span>
      </div>`;
    }).join("");
    const more = items.length > 8 ? `<div class="text-gray-500 mt-1" style="font-size:${Math.max(8, labelFontPx - 1)}px">\u2026\u5171 ${items.length} \u7C7B</div>` : "";
    host.innerHTML = `<div class="flex flex-col gap-1.5">${rows}${more}</div>`;
  }
  function wireStandaloneGraphChrome(cy, payload, opts) {
    const themeColor = payload.themeColor || "#2563eb";
    let sizing = {
      nodeSize: payload.nodeSize ?? DEFAULT_GRAPH_STYLESHEET_SIZING.nodeSize,
      labelFontPx: payload.labelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.labelFontPx,
      edgeWeight: payload.edgeWeight ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeWeight,
      edgeLabelFontPx: payload.edgeLabelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeLabelFontPx
    };
    let legendFontPx = Math.max(
      6,
      Math.min(24, Math.round(payload.labelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.labelFontPx))
    );
    let edgeCurve = payload.edgeCurve !== false;
    let chrome = {
      opacity: payload.chrome?.opacity ?? DEFAULT_MAP_UI_CHROME_OPACITY,
      blurPx: payload.chrome?.blurPx ?? DEFAULT_MAP_UI_CHROME_BLUR_PX
    };
    let settingsOpen = false;
    const btnSettings = document.getElementById("btnSettings");
    const panelSettings = document.getElementById("graph-settings-panel");
    let currentLegendItems = [...payload.legendItems ?? []];
    const presets = (payload.presets ?? []).filter((p) => p && p.id);
    let activePresetId = payload.activePresetId ?? null;
    const applyStyles = () => {
      applyChromeCssVars(chrome);
      updateGraphStylesheet(
        cy,
        getGraphStylesheet(themeColor, sizing, chrome, { edgeCurve })
      );
      let maxDegree = 0;
      cy.nodes().forEach((node) => {
        if (node.hasClass("frame-cluster-halo") || node.hasClass("frame-cluster-label")) return;
        const d = Number(node.data("linkDegree") ?? 0);
        if (Number.isFinite(d) && d > maxDegree) maxDegree = d;
      });
      const favScale = 1.5;
      const coreScale = GRAPH_FOCUS_CORE_NODE_SCALE;
      cy.batch(() => {
        cy.nodes().forEach((node) => {
          if (node.hasClass("frame-cluster-halo") || node.hasClass("frame-cluster-label")) return;
          const degree = Number(node.data("linkDegree") ?? 0);
          const ns = graphNodeSizeWithWeight(
            graphNodeSizeFromDegree(
              Number.isFinite(degree) ? degree : 0,
              maxDegree,
              sizing.nodeSize
            ),
            node.data("nodeWeight")
          );
          node.data("nodeSize", ns);
          node.data("nodeSizeFav", Math.round(ns * favScale * 100) / 100);
          node.data("nodeSizeCore", Math.round(ns * coreScale * 100) / 100);
          node.data("nodeSizeFavCore", Math.round(ns * favScale * coreScale * 100) / 100);
          const emojiSize = (diameter) => Math.round(Math.max(9, Math.min(24, diameter * 0.58)) * 100) / 100;
          node.data("nodeEmojiSize", emojiSize(ns));
          node.data("nodeEmojiSizeFav", emojiSize(ns * favScale));
          node.data("nodeEmojiSizeCore", emojiSize(ns * coreScale));
          node.data("nodeEmojiSizeFavCore", emojiSize(ns * favScale * coreScale));
        });
      });
      applyGraphHighlightLabelScreenSize(cy, sizing, chrome);
      if (edgeCurve) syncGraphEdgeCurveDistances(cy);
      if (opts?.chromeLabelOpts) {
        opts.chromeLabelOpts.nodeSize = sizing.nodeSize;
        opts.chromeLabelOpts.labelFontPx = sizing.labelFontPx;
        opts.chromeLabelOpts.chromeOpacity = chrome.opacity;
        opts.chromeLabelOpts.chromeBlurPx = chrome.blurPx;
      }
      renderLegendItems(currentLegendItems, legendFontPx);
      opts?.onRefreshChromeLabels?.();
    };
    const applyPresetById = (id) => {
      const preset = presets.find((p) => p.id === id);
      if (!preset) return;
      activePresetId = id;
      applyGraphViewPresetToCy(cy, preset);
      applyGraphViewPresetVisibility(cy, preset);
      if (preset.tagHidden == null && preset.frameHidden == null) {
        applyGraphDualLayerNodeVisibility(
          cy,
          payload.graphLayers?.hidden ?? [],
          payload.graphFrameLayers?.hidden ?? [],
          payload.graphLayers?.tagVisibilityLogic ?? "or",
          payload.graphEmojiLayers?.hidden ?? []
        );
      }
      if (edgeCurve) syncGraphEdgeCurveDistances(cy);
      currentLegendItems = [...preset.legendItems ?? []];
      renderLegendItems(currentLegendItems, legendFontPx);
      scheduleGraphResizeAndFit(cy);
      opts?.onRefreshChromeLabels?.();
      const sel = document.getElementById("graph-preset-select");
      if (sel) sel.value = id;
    };
    const syncOpenUi = () => {
      setBtnActive(btnSettings, settingsOpen, themeColor);
      panelSettings?.classList.toggle("hidden", !settingsOpen);
    };
    function renderSettings() {
      if (!panelSettings) return;
      const slider = (id, label, value, min, max, step, fmt) => `
      <label class="block min-w-0">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-gray-600">${label}</span>
          <span class="tabular-nums text-[10px] text-gray-400" data-val-for="${id}">${fmt(value)}</span>
        </div>
        <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"
          class="w-full" style="accent-color:${escapeHtml2(themeColor)}" />
      </label>`;
      panelSettings.innerHTML = `
      <h2 class="shrink-0 px-3 pt-2.5 text-xs font-medium text-gray-500">\u8BBE\u7F6E</h2>
      <div class="overflow-y-auto px-3 pt-2 pb-3 space-y-4" style="max-height:min(22rem,60dvh)">
        <div>
          <div class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">\u754C\u9762\u5916\u89C2</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            ${slider("st-chrome-op", "\u9762\u677F\u80CC\u666F\u900F\u660E\u5EA6", chrome.opacity, 0.15, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
            ${slider("st-chrome-blur", "\u80CC\u666F\u6A21\u7CCA\u534A\u5F84", chrome.blurPx, 0, 24, 1, (v) => `${Math.round(v)}px`)}
          </div>
        </div>
        <div>
          <div class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Graph Style</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            ${slider("st-node", "\u8282\u70B9\u6700\u5C0F\u5C3A\u5BF8", sizing.nodeSize, 1, GRAPH_NODE_SIZE_MAX_PX, 1, (v) => `${Math.round(v)}px`)}
            ${slider("st-label", "\u8282\u70B9\u6807\u7B7E\u5B57\u53F7", sizing.labelFontPx, 4, 16, 1, (v) => `${Math.round(v)}px`)}
            ${slider("st-legend", "\u56FE\u4F8B\u5B57\u53F7", legendFontPx, 6, 24, 1, (v) => `${Math.round(v)}px`)}
            ${slider("st-edge-label", "\u8FB9\u6807\u7B7E\u5B57\u53F7", sizing.edgeLabelFontPx, 3, 16, 1, (v) => `${Math.round(v)}px`)}
            <div class="flex min-w-0 items-center justify-between gap-3 sm:col-span-2">
              <span class="text-xs font-medium text-gray-800">\u66F2\u7EBF\u76F8\u8FDE</span>
              <button
                type="button"
                id="st-curve"
                role="switch"
                aria-checked="${edgeCurve ? "true" : "false"}"
                aria-label="\u66F2\u7EBF\u76F8\u8FDE"
                class="relative h-5 w-9 shrink-0 rounded-full border-0 cursor-pointer transition-colors ${edgeCurve ? "" : "bg-gray-200"}"
                style="${edgeCurve ? `background-color:${escapeHtml2(themeColor)}` : ""}"
              >
                <span
                  class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${edgeCurve ? "translate-x-4" : "translate-x-0"}"
                ></span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
      const bindRange = (id, apply) => {
        const el = panelSettings.querySelector(`#${id}`);
        if (!el) return;
        el.addEventListener("input", () => {
          const v = Number(el.value);
          apply(v);
          const label = panelSettings.querySelector(`[data-val-for="${id}"]`);
          if (label) {
            if (id === "st-node" || id === "st-label" || id === "st-legend" || id === "st-edge-label" || id === "st-chrome-blur") {
              label.textContent = `${Math.round(v)}px`;
            } else if (id === "st-chrome-op") {
              label.textContent = `${Math.round(v * 100)}%`;
            } else {
              label.textContent = String(Math.round(v));
            }
          }
          applyStyles();
        });
      };
      bindRange("st-node", (v) => {
        sizing = { ...sizing, nodeSize: Math.round(Math.min(GRAPH_NODE_SIZE_MAX_PX, Math.max(1, v))) };
      });
      bindRange("st-label", (v) => {
        sizing = { ...sizing, labelFontPx: Math.round(Math.min(16, Math.max(4, v))) };
      });
      bindRange("st-legend", (v) => {
        legendFontPx = Math.round(Math.min(24, Math.max(6, v)));
      });
      bindRange("st-edge-label", (v) => {
        sizing = { ...sizing, edgeLabelFontPx: Math.round(Math.min(16, Math.max(3, v))) };
      });
      bindRange("st-chrome-op", (v) => {
        chrome = { ...chrome, opacity: Math.max(0.15, Math.min(1, v)) };
      });
      bindRange("st-chrome-blur", (v) => {
        chrome = { ...chrome, blurPx: Math.round(Math.max(0, Math.min(24, v))) };
      });
      panelSettings.querySelector("#st-curve")?.addEventListener("click", (e) => {
        e.stopPropagation();
        edgeCurve = !edgeCurve;
        applyStyles();
        renderSettings();
      });
    }
    btnSettings?.addEventListener("click", (e) => {
      e.stopPropagation();
      settingsOpen = !settingsOpen;
      syncOpenUi();
      if (settingsOpen) renderSettings();
    });
    document.addEventListener("pointerdown", (e) => {
      if (!settingsOpen) return;
      const t = e.target;
      const host = document.getElementById("graph-top-left");
      if (host && t && host.contains(t)) return;
      settingsOpen = false;
      syncOpenUi();
    });
    renderLegendItems(currentLegendItems, legendFontPx);
    applyChromeCssVars(chrome);
    syncOpenUi();
    const presetHost = document.getElementById("graph-preset-switcher");
    const presetSelect = document.getElementById("graph-preset-select");
    if (presets.length > 0 && presetHost && presetSelect) {
      presetHost.classList.remove("hidden");
      presetSelect.innerHTML = presets.map(
        (p) => `<option value="${escapeHtml2(p.id)}">${escapeHtml2(p.name || "\u9884\u8BBE")}</option>`
      ).join("");
      const initial = (activePresetId && presets.some((p) => p.id === activePresetId) ? activePresetId : presets[0]?.id) || "";
      if (initial) {
        applyPresetById(initial);
      }
      presetSelect.addEventListener("change", () => {
        applyPresetById(presetSelect.value);
      });
    } else {
      presetHost?.classList.add("hidden");
      scheduleGraphResizeAndFit(cy);
    }
  }

  // graph-standalone-entry.ts
  function main() {
    const boot = window.__KM_GRAPH__;
    const Cy = window.cytoscape;
    if (!boot || !Cy) return;
    try {
      Cy.use(window.cytoscapeFcose);
    } catch (e) {
      console.warn(e);
    }
    const payload = decodeGraphPayloadFromBase64(boot.b64);
    const container = document.getElementById("cy");
    const stage = document.getElementById("graph-stage");
    const chromeLayer = document.getElementById("graph-chrome-labels");
    if (!container) return;
    const cy = Cy({
      container,
      elements: payload.elements,
      style: payload.stylesheet,
      minZoom: 0.15,
      maxZoom: 4,
      wheelSensitivity: 0
    });
    attachBoardlikeWheelZoom(cy);
    if (payload.graphFrameLayers != null) {
      applyGraphDualLayerNodeVisibility(
        cy,
        payload.graphLayers?.hidden ?? [],
        payload.graphFrameLayers.hidden ?? [],
        payload.graphLayers?.tagVisibilityLogic ?? "or",
        payload.graphEmojiLayers?.hidden ?? []
      );
    } else if (payload.graphLayers?.hidden?.length) {
      applyGraphLayerNodeVisibility(
        cy,
        payload.graphLayers.hidden,
        payload.graphLayerGroupStandard ?? "tag"
      );
    } else {
      applyGraphNodeStackZIndex(cy);
    }
    const chromeOpacity = payload.chrome?.opacity ?? DEFAULT_MAP_UI_CHROME_OPACITY;
    const chromeBlurPx = payload.chrome?.blurPx ?? DEFAULT_MAP_UI_CHROME_BLUR_PX;
    const nodeSize = payload.nodeSize ?? DEFAULT_GRAPH_STYLESHEET_SIZING.nodeSize;
    applyGraphHighlightLabelScreenSize(cy, { nodeSize }, { opacity: chromeOpacity, blurPx: chromeBlurPx });
    attachGraphResizeObserver(cy, container);
    let refreshChromeLabels = null;
    const chromeLabelOpts = {
      themeColor: payload.themeColor,
      nodeSize,
      chromeOpacity,
      chromeBlurPx,
      host: stage,
      labelFontPx: payload.labelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.labelFontPx
    };
    if (chromeLayer) {
      refreshChromeLabels = wireStandaloneHighlightChromeLabels(cy, chromeLayer, chromeLabelOpts);
    }
    wireStandaloneGraphInteractions(
      cy,
      payload,
      payload.themeColor,
      window.marked ?? null,
      () => refreshChromeLabels?.()
    );
    wireStandaloneGraphChrome(cy, payload, {
      onRefreshChromeLabels: () => refreshChromeLabels?.(),
      chromeLabelOpts
    });
    let labelSizeRaf = null;
    cy.on("viewport", () => {
      if (labelSizeRaf != null) return;
      labelSizeRaf = requestAnimationFrame(() => {
        labelSizeRaf = null;
        if (cy.destroyed?.()) return;
        applyGraphHighlightLabelScreenSize(
          cy,
          { nodeSize: chromeLabelOpts.nodeSize, labelFontPx: chromeLabelOpts.labelFontPx },
          { opacity: chromeLabelOpts.chromeOpacity, blurPx: chromeLabelOpts.chromeBlurPx }
        );
      });
    });
  }
  main();
})();
