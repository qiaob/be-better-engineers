// 一份完整的学习页数据，主题是「一致性哈希」。
// 用法：用这个文件的全部内容，替换模板里的占位标记 /*__LESSON__*/ null。
// 数据可以是一个普通的对象字面量；这里因为图里的位置和数字要现算，所以包了一层函数。
(() => {
  /* ---- 这一页专用的小工具：图里的位置和数字都是实算的，不是画上去的 ---- */
  const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const mix = h => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
  const hash = s => mix(fnv(s));
  const TAU = Math.PI * 2;
  const ang = name => hash(name) / 4294967296 * TAU;              // 环上的角度：0 在正上方，顺时针增大
  const NODE = n => n + '#1335', KEY = i => 'k' + i + '#1137';     // 后缀是挑过的，只为让图看得清
  const ABC = ['A', 'B', 'C'], ABCD = ['A', 'B', 'C', 'D'];
  const USERS = Array.from({length: 10000}, (_, i) => 'user:' + i);
  const MANY = USERS.map(ang);
  const ringOf = (nodes, v = 1) => nodes.flatMap(n => Array.from({length: v}, (_, i) => ({node: n, a: ang(v === 1 ? NODE(n) : NODE(n) + '/' + i)}))).sort((p, q) => p.a - q.a);
  const owner = (ring, a) => (ring.find(p => p.a >= a) || ring[0]).node;    // 顺时针遇到的第一个点
  const count = (ring, nodes, angles) => { const c = {}; nodes.forEach(n => { c[n] = 0; }); angles.forEach(a => { c[owner(ring, a)]++; }); return c; };
  const pct = (ring, nodes) => { const c = count(ring, nodes, MANY); return nodes.map(n => ({node: n, pct: c[n] / MANY.length * 100})); };

  const r3 = ringOf(ABC), r4 = ringOf(ABCD), r16 = ringOf(ABC, 16), r128 = ringOf(ABC, 128);
  const keyAng = Array.from({length: 12}, (_, i) => ang(KEY(i + 1)));
  const keyHash = Array.from({length: 12}, (_, i) => hash(KEY(i + 1)));
  const k3 = count(r3, ABC, keyAng), k4 = count(r4, ABCD, keyAng);
  const moved = a => owner(r3, a) !== owner(r4, a);
  const movedRing = keyAng.filter(moved).length;
  const movedRingPct = (MANY.filter(moved).length / MANY.length * 100).toFixed(1);
  const movedFrom = Array.from(new Set(MANY.filter(moved).map(a => owner(r3, a)))).join('、');
  const movedMod = keyHash.filter(h => h % 3 !== h % 4).length;
  const movedModPct = (USERS.map(hash).filter(h => h % 3 !== h % 4).length / USERS.length * 100).toFixed(1);
  const p1 = pct(r3, ABC), p16 = pct(r16, ABC), p128 = pct(r128, ABC);
  const spread = p => (Math.max(...p.map(x => x.pct)) - Math.min(...p.map(x => x.pct))).toFixed(1);
  const list = p => p.map(x => x.node + ' ' + x.pct.toFixed(0) + '%').join('、');
  const hop = USERS.find(k => moved(ang(k)));                      // 一个在 D 加入后换了节点的键
  const hopFrom = owner(r3, ang(hop));

  /* ---- 画图 ---- */
  const CX = 170, CY = 172, R = 118, X0 = 372, f1 = v => v.toFixed(1);
  const at = (a, r = R) => [CX + r * Math.sin(a), CY - r * Math.cos(a)];
  const sCls = n => n === 'D' ? 's-ink' : 'sc' + (ABC.indexOf(n) + 1);
  const fCls = n => n === 'D' ? 'ink' : 'c' + (ABC.indexOf(n) + 1);
  const svg = (label, inner) => `<svg viewBox="0 0 640 344" role="img" aria-label="${label}">${inner}</svg>`;
  const arcs = (ring, gap) => ring.map((p, i) => {
    let a0 = ring[(i - 1 + ring.length) % ring.length].a + gap;
    const a1 = p.a - gap;
    if (i === 0) a0 -= TAU;
    if (a1 <= a0) return '';
    const [x0, y0] = at(a0), [x1, y1] = at(a1);
    return `<path d="M${f1(x0)} ${f1(y0)} A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f1(x1)} ${f1(y1)}" fill="none" stroke-width="8" class="${sCls(p.node)}"/>`;
  }).join('');
  const keyDots = hot => keyAng.map(a => {
    const [x, y] = at(a);
    return hot && hot(a)
      ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="10.5" fill="none" stroke-width="2" class="s-hot"/><circle cx="${f1(x)}" cy="${f1(y)}" r="5.5" class="hot gap"/>`
      : `<circle cx="${f1(x)}" cy="${f1(y)}" r="5.5" class="ink gap"/>`;
  }).join('');
  const nodeMarks = nodes => nodes.map(n => {
    const a = ang(NODE(n)), [x, y] = at(a), [lx, ly] = at(a, R + 26);
    return `<circle cx="${f1(x)}" cy="${f1(y)}" r="11" class="${fCls(n)} gap"/><text x="${f1(lx)}" y="${f1(ly)}" dy="0.35em" text-anchor="middle" class="t-strong">${n}</text>`;
  }).join('');
  const center = (l1, l2) => `<text x="${CX}" y="${CY - 9}" text-anchor="middle" class="t-muted">${l1}</text><text x="${CX}" y="${CY + 11}" text-anchor="middle" class="t-muted">${l2}</text>`;
  const tally = (title, rows, y0) => `<text x="${X0}" y="${y0}" class="t-strong">${title}</text>` + rows.map((r, i) => {
    const y = y0 + 30 + i * 30;
    return `<circle cx="${X0 + 7}" cy="${y}" r="7" class="${fCls(r.node)}"/><text x="${X0 + 24}" y="${y}" dy="0.35em" class="t-strong">${r.node}</text><text x="${X0 + 46}" y="${y}" dy="0.35em" class="t-num">${r.text}</text>`;
  }).join('');
  const bars = (title, rows, y0) => {
    const K = 2.6, bx = X0 + 22, even = 100 / rows.length, xe = bx + even * K, yb = y0 + 22 + rows.length * 30;
    return `<text x="${X0}" y="${y0}" class="t-strong">${title}</text>` +
      `<line x1="${f1(xe)}" y1="${y0 + 12}" x2="${f1(xe)}" y2="${yb - 6}" stroke-dasharray="3 3" class="s-line"/>` +
      `<text x="${f1(xe)}" y="${yb + 8}" text-anchor="middle" class="t-muted t-small">均分 ${even.toFixed(0)}%</text>` +
      rows.map((r, i) => {
        const y = y0 + 22 + i * 30, w = Math.max(6, r.pct * K);
        return `<text x="${X0}" y="${y + 9}" dy="0.35em" class="t-strong">${r.node}</text>` +
          `<path d="M${bx} ${y} h${f1(w - 4)} a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 h${f1(4 - w)} z" class="${fCls(r.node)}"><title>${r.node}：${r.pct.toFixed(1)}%</title></path>` +
          `<text x="${f1(bx + w + 8)}" y="${y + 9}" dy="0.35em" class="t-num">${r.pct.toFixed(0)}%</text>`;
      }).join('');
  };
  const buckets = (n, prev) => {
    const bw = (600 - 12 * (n - 1)) / n, per = Math.max(1, Math.floor((bw - 12) / 46)), ox = (bw - (per * 46 - 6)) / 2;
    let out = `<text x="20" y="58" class="t-strong t-mono">hash(key) % ${n}</text>`;
    for (let b = 0; b < n; b++) {
      const x = 20 + b * (bw + 12);
      out += `<text x="${f1(x + bw / 2)}" y="92" text-anchor="middle" class="t-muted">机器 ${b}</text>` +
        `<rect x="${f1(x)}" y="102" width="${f1(bw)}" height="130" rx="10" stroke-width="1.5" class="tint s-line"/>`;
      keyHash.map((h, i) => ({k: 'k' + (i + 1), h})).filter(o => o.h % n === b).forEach((o, i) => {
        const hot = prev && o.h % prev !== b, cx = x + ox + (i % per) * 46, cy = 114 + Math.floor(i / per) * 30;
        out += `<rect x="${f1(cx)}" y="${cy}" width="40" height="22" rx="6" stroke-width="${hot ? 2 : 1}" class="${hot ? 'hot-soft s-hot' : 'panel s-line'}"/>` +
          `<text x="${f1(cx + 20)}" y="${cy + 11}" dy="0.35em" text-anchor="middle" class="t-small">${o.k}</text>`;
      });
    }
    return out;
  };
  const hotLegend = (x, y, text) => `<circle cx="${x + 10}" cy="${y}" r="10.5" fill="none" stroke-width="2" class="s-hot"/><circle cx="${x + 10}" cy="${y}" r="5.5" class="hot gap"/><text x="${x + 30}" y="${y}" dy="0.35em">${text}</text>`;

  return {
    lang: 'zh-CN',
    id: 'consistent-hashing',
    title: '一致性哈希',
    oneLine: '把数据分到多台机器上的一种办法：机器增减时，只需要搬动很少的数据。',
    depth: '能验',
    minutes: 40,
    updated: '2026-11-16',

    scope: {
      is: '把键分配给一组节点的一种办法。节点增加或减少时，只有一小部分键需要换节点。',
      isNot: '不是「数据一致性」。名字里的一致，指的是键和节点的对应关系稳定，和副本之间的数据是否相同无关。',
      why: '用 `hash(key) % N` 分配时，N 一变，绝大多数键都要换节点：缓存会集体失效，存储要大规模搬迁。',
      where: '分布式缓存和存储里「一个键该去哪个节点」这一层。上游是客户端或代理，下游是存数据的节点。',
      applies: '适合节点会增减的集群。节点数固定不变，或者需要按范围查询的场景，用不着它。',
      stop: '能讲清为什么只搬一小段；看到一个分片方案，能判断该不该用它，有没有考虑负载不均和热点。',
      core: ['哈希环', '顺时针找节点', '增减节点只影响相邻一段', '虚拟节点', '适用边界'],
      edge: ['有界负载', 'Rendezvous 哈希', 'Jump 哈希', '副本怎么放'],
      out: ['某个具体库的 API', '哈希函数怎么选', '数据迁移的工程实现'],
      prereqs: [
        {name: '哈希函数', primer: '把任意输入变成一个固定范围内的数。同样的输入永远得到同样的数，不同的输入得到的数看起来是随机散开的。'},
        {name: '取模分片', primer: '用 `hash(key) % N` 决定一个键去第几台机器，N 是机器数。'}
      ]
    },

    map: {
      nodes: [
        {id: 'key', label: '键', col: 0, row: 0, note: '要存取的数据的名字，比如 `user:42`。'},
        {id: 'hash', label: '哈希函数', col: 1, row: 0, kind: 'prereq', note: '把键和节点的名字都变成环上的一个位置。'},
        {id: 'node', label: '节点', col: 2, row: 0, note: '存数据的机器。'},
        {id: 'change', label: '节点增减', col: 0, row: 1, kind: 'core', note: '加入或移走一个节点，只改变它和前一个节点之间那一段的归属。'},
        {id: 'ring', label: '哈希环', col: 1, row: 1, kind: 'core', note: '把哈希值的范围首尾相接，看成一个圆。键和节点都落在这个圆上。'},
        {id: 'rule', label: '顺时针规则', col: 2, row: 1, kind: 'core', note: '一个键，归它顺时针方向遇到的第一个节点。'},
        {id: 'skew', label: '负载不均', col: 1, row: 2, note: '节点少的时候，它们在环上的位置是随机的，各自管的弧长可能差好几倍。'},
        {id: 'vnode', label: '虚拟节点', col: 2, row: 2, kind: 'core', note: '让一个节点在环上占很多个点，各个节点管的弧长加起来就接近了。'}
      ],
      edges: [
        {from: 'key', to: 'hash', label: '算位置'},
        {from: 'node', to: 'hash', label: '算位置'},
        {from: 'hash', to: 'ring', label: '落在'},
        {from: 'ring', to: 'rule', label: '在环上找'},
        {from: 'change', to: 'ring', label: '只改一小段'},
        {from: 'ring', to: 'skew', label: '位置随机'},
        {from: 'skew', to: 'vnode', label: '用它缓解'},
        {from: 'vnode', to: 'rule', label: '规则不变'}
      ]
    },

    bridge: {
      intro: '你多半已经用过取模分片。一致性哈希解决的是同一个问题，只是换了一条规则。',
      pairs: [
        {known: '取模分片：`hash(key) % N`', new: '哈希环：顺时针找第一个节点',
         same: '都是先对键做哈希，再由哈希值决定去哪个节点。', differ: '取模的结果依赖 N，N 一变几乎全变。环上的归属只取决于相邻的节点。'},
        {known: '环线公交：上车后坐到下一站', new: '键沿着环走到第一个节点',
         same: '都是沿固定方向找最近的下一个。', differ: '公交站是人排好的，间隔均匀。节点的位置是哈希算出来的，间隔可能差很多。'},
        {known: '轮询：请求轮流发给每台机器', new: '同一个键每次都去同一个节点',
         same: '都在把压力分摊到多台机器上。', differ: '轮询不看请求内容，同一个键可能每次去不同的机器，所以不能用来定位数据。'}
      ],
      predict: {
        q: '3 台机器用取模分片，加到 4 台。大约有多少比例的键要换机器？',
        a: `约四分之三。一个键想留在原地，需要 \`h % 3\` 和 \`h % 4\` 恰好相等，这只有 1/4 的可能。本页用 1 万个键实算，换机器的占 ${movedModPct}%。`
      }
    },

    demos: [
      {
        title: '换一条规则，要搬的数据差多少',
        kind: 'frames',
        steps: [
          {svg: svg('取模分片：12 个键分到 3 台机器', buckets(3) + `<text x="20" y="269" dy="0.35em" class="t-muted">12 个键，按余数分到 3 台机器</text>`),
           caption: '先看取模。12 个键，`hash(key) % 3` 的结果决定各自去哪台机器。'},
          {ask: '加一台机器，规则变成 `% 4`。这 12 个键里，有几个要换机器？',
           svg: svg('加到 4 台后，大部分键换了机器', buckets(4, 3) + `<rect x="20" y="258" width="40" height="22" rx="6" stroke-width="2" class="hot-soft s-hot"/><text x="70" y="269" dy="0.35em">换了机器：12 个里有 ${movedMod} 个</text>`),
           caption: `红框是换了机器的键：12 个里有 ${movedMod} 个。换成 1 万个键实算，是 ${movedModPct}%。如果这是缓存，等于几乎全部失效。`},
          {ask: '换个办法：把机器和键都放到一个圆上，每个键归顺时针方向遇到的第一台机器。这样分，三台机器管的键一样多吗？',
           svg: svg('哈希环：三个节点各管一段弧', arcs(r3, 0.012) + keyDots() + nodeMarks(ABC) + center('3 个节点', '12 个键') +
             tally('12 个键归谁', ABC.map(n => ({node: n, text: k3[n] + ' 个键'})), 96) +
             `<text x="${X0}" y="248" class="t-muted t-small">弧的颜色：这段弧归哪个节点</text><text x="${X0}" y="266" class="t-muted t-small">黑点：键</text>`),
           caption: `A、B、C 三个节点和 12 个键都落在同一个环上。每一段弧上的键，归这段弧顺时针尽头的那个节点。并不一样多：A 管 ${k3.A} 个，B 管 ${k3.B} 个，C 管 ${k3.C} 个。`},
          {ask: '现在加入节点 D。哪些键要换节点？',
           svg: svg('加入 D：只有一段弧换了主人', arcs(r4, 0.012) + keyDots(moved) + nodeMarks(ABCD) + center('加入 D', '') +
             tally('加入 D 之后', ABCD.map(n => ({node: n, text: k4[n] + ' 个键' + (k4[n] !== (k3[n] || 0) ? '（' + (k4[n] > (k3[n] || 0) ? '+' : '−') + Math.abs(k4[n] - (k3[n] || 0)) + '）' : '')})), 80) +
             hotLegend(X0, 250, '换了节点的键')),
           caption: `D 只从 ${movedFrom} 手里接走了自己身后那一段弧。12 个键里只有 ${movedRing} 个换了节点，其余的原地不动。1 万个键实算，换节点的占 ${movedRingPct}%；平均来说是 1/4，具体多少取决于 D 落在哪。`},
          {ask: '回到三个节点。它们各自承担的比例，会接近三分之一吗？',
           svg: svg('三个节点承担的比例差很多', arcs(r3, 0.012) + keyDots() + nodeMarks(ABC) + center('每个节点', '1 个点') + bars('1 万个键的分布', p1, 106)),
           caption: `不会。节点的位置是哈希算出来的，三段弧长差很多：1 万个键里，${list(p1)}。最多和最少差了 ${spread(p1)} 个百分点。`},
          {ask: '不换哈希函数，有什么办法让三个节点管的弧长接近？',
           svg: svg('虚拟节点：每个节点占很多个点，比例接近均分', arcs(r16, 0.006) + keyDots() + center('每个节点', '16 个点') + bars('每个节点 16 个点', p16, 56) + bars('每个节点 128 个点', p128, 204)),
           caption: `让每个节点在环上占很多个点，这就是虚拟节点。每个节点 16 个点时是 ${list(p16)}；128 个点时是 ${list(p128)}。代价是环上的点变多，查找和元数据都更重。`}
        ]
      },
      {
        title: '一次读请求怎么找到节点',
        kind: 'sequence',
        actors: ['客户端', '路由层', '节点 ' + hopFrom, '节点 D'],
        steps: [
          {from: '客户端', to: '路由层', label: `get(${hop})`, caption: '客户端要读一个键。它不需要知道数据在哪台机器上。'},
          {from: '路由层', to: '路由层', label: '算哈希，顺时针找', caption: `路由层算出这个键在环上的位置，顺时针遇到的第一个节点是 ${hopFrom}。整个过程只用到本地的一份节点列表，不用问任何人。`},
          {from: '路由层', to: '节点 ' + hopFrom, label: '读', caption: `请求发给 ${hopFrom}。`},
          {from: '节点 ' + hopFrom, to: '客户端', label: '返回数据', caption: `${hopFrom} 返回数据。`},
          {ask: 'D 加入之后，同一个键再来一次，会去哪？', from: '路由层', to: '路由层', label: 'D 加入，再找一次',
           caption: '这个键正好落在 D 接管的那一段弧上，顺时针遇到的第一个节点变成了 D。'},
          {from: '路由层', to: '节点 D', label: '读', caption: `请求发给 D。如果是缓存，D 上还没有这条数据，这是一次未命中；如果是存储，得先把这一段的数据从 ${hopFrom} 搬到 D。`}
        ]
      }
    ],

    explain: [
      {prompt: '用三四句话讲清：为什么加一台机器，取模分片要搬大部分数据，而哈希环只搬一小段？',
       points: [
         '取模的结果依赖机器数 N，N 变了，几乎所有键的余数都会变。',
         '环上一个键归谁，只取决于它顺时针遇到的第一个节点，和节点总数无关。',
         '新节点只接管它和前一个节点之间的那一段弧，其余的弧不受影响。',
         '平均搬动的比例大约是 1/(N+1)。'
       ]},
      {prompt: '虚拟节点解决了什么问题，没解决什么问题，代价是什么？',
       points: [
         '解决：节点少时位置随机造成的负载不均。',
         '解决：一个节点下线时，负载全部压给顺时针的下一个节点。',
         '没解决：热点键。它拉平的是键的数量，不是访问量。',
         '代价：环上的点变多，查找和元数据的成本更高。'
       ]}
    ],

    practice: {
      quiz: [
        {q: '环上有 A、B、C 三个节点，没有用虚拟节点。B 下线了，哪些键要换节点？',
         options: [
           {text: '所有的键', why: '那是取模分片的情况。环上的归属只和相邻节点有关，A 和 C 原来管的键不受影响。'},
           {text: '原来归 B 的键，全部交给顺时针方向的下一个节点', correct: true, why: 'B 管的那段弧并进了下一个节点的弧。这也意味着那个节点的负载会突然变重。'},
           {text: '原来归 B 的键，平均分给 A 和 C', why: '没有虚拟节点时，B 只有一段弧，它整段并给顺时针的下一个节点。用了虚拟节点，B 的很多小段才会分散出去。'},
           {text: '不需要换', why: 'B 不在了，原来归它的键必须有新的去处。'}
         ]},
        {q: '用了虚拟节点之后，下面哪件事仍然会发生？',
         options: [
           {text: '节点少的时候，各节点管的键数量差好几倍', why: '这正是虚拟节点缓解的问题。'},
           {text: '一个访问量特别大的键，把它所在的那台机器打满', correct: true, why: '虚拟节点让每台机器管的键的数量接近，管不了单个键的访问量。热点键要另外处理。'},
           {text: '加一台机器，大部分键要换节点', why: '不会。只搬一小部分，这是一致性哈希本身的性质，和虚拟节点无关。'}
         ]},
        {q: '下面哪种情况，用取模分片就够了？',
         options: [
           {text: '缓存集群每周都要扩缩容', why: '每次扩缩容，取模分片都会让大部分缓存失效。一致性哈希正是为这种情况准备的。'},
           {text: '节点经常因为故障下线又恢复', why: '节点上下线，等于 N 在变，取模每次都要重新洗牌。'},
           {text: '集群固定 8 台机器，几年不变，数据随时可以全量重建', correct: true, why: '节点数不变，取模的缺点根本不会出现。多引入一个环，只是多了一样要维护的东西。'}
         ]}
      ],
      tasks: [
        {task: '环上有 4 个节点，加到 5 个。平均要搬多少比例的键？如果是取模分片，从 4 台加到 5 台呢？',
         hints: ['新节点接管的是环上的哪一部分？平均占整个环的多少？', '取模时，一个键留在原地的条件是 `h % 4` 和 `h % 5` 相等。'],
         answer: '环：新节点平均接管环的 1/5，所以平均搬 **1/5**。取模：留在原地的可能只有 1/5，所以要搬 **4/5**。'},
        {task: '缓存集群有 3 台机器，其中一台的内存是另外两台的两倍。怎么让它多承担一些键？',
         hints: ['一个节点在环上管多少，取决于它占了多少个点。'],
         answer: '给它**两倍数量的虚拟节点**。每个节点管的弧长大致和它的点数成正比，点数按容量加权就行。'},
        {task: '一个缓存集群用了一致性哈希，没用虚拟节点。一台机器宕机后，它在环上的下一台很快也被打挂，接着是再下一台。为什么？怎么缓解？',
         hints: ['宕机那台机器管的键，去了哪里？', '接手的那台机器，原本就有自己的负载。'],
         answer: '宕机节点的整段弧并给了顺时针的下一个节点，后者的负载突然大增，撑不住就也挂掉，于是更长的一段弧压向再下一个，形成连锁。缓解：用**虚拟节点**把宕机节点的负载分散给所有节点；给每个节点设**负载上限**，超了就顺延到下一个；再配合限流。'}
      ]
    },

    limits: {
      fails: [
        {when: '节点数固定，很少变化', then: '它要解决的问题并不存在，环只是多出来的复杂度', instead: '直接取模，或者一张固定的分片表'},
        {when: '有访问量特别大的热点键', then: '它拉平的是键的数量，不是流量，热点键照样压在一台机器上', instead: '本地缓存、把热点键拆开，或者给热点单独加副本'},
        {when: '需要按范围查询', then: '哈希把相邻的键打散到了各个节点，范围查询要问遍所有节点', instead: '按键的范围分片'},
        {when: '节点很少，又没用虚拟节点', then: '负载可能差好几倍，一台宕机还可能压垮邻居', instead: '加虚拟节点，或者用带负载上限的变体'}
      ],
      myths: [
        {myth: '一致性哈希能保证数据一致。', truth: '名字里的一致，说的是键和节点的对应关系稳定。副本之间的数据是否一致，是复制协议的事。'},
        {myth: '用了一致性哈希，加节点就不用搬数据了。', truth: '要搬，只是只搬新节点接管的那一段，而不是几乎全部。'},
        {myth: '一致性哈希能让负载均匀。', truth: '不保证。节点少时各段弧长差很多，要靠虚拟节点拉平。而且它拉平的是键的数量，不是访问量。'}
      ],
      deeper: [
        {label: '原始论文', note: 'Karger 等人 1997 年提出，最初是为了解决网页缓存的分配问题。'},
        {label: 'Dynamo 论文（2007）', note: '讲分区的部分，说明了虚拟节点在真实系统里怎么用。'},
        {label: '替代方案', note: 'Rendezvous 哈希和 Jump 哈希解决的是同一个问题，各有取舍，可以对比着看。'}
      ]
    },

    retain: {
      card: [
        '节点和键用同一个哈希函数，落在同一个{{环}}上。',
        '一个键，归它{{顺时针}}方向遇到的第一个节点。',
        '加一个节点，只搬它和{{前一个节点}}之间的那一段。',
        '节点少时各段弧长差很多，用{{虚拟节点}}拉平。',
        '它拉平的是键的数量，管不了{{热点键}}。',
        '节点数固定不变时，用{{取模}}就够了。'
      ],
      review: [1, 7, 30]
    },

    checks: [
      {claim: '取模分片从 3 台加到 4 台，约 3/4 的键换机器', status: '已验证', how: `本页用 1 万个键实算：${movedModPct}%。`},
      {claim: '环上加一个节点，只有新节点接管的那一段换节点', status: '已验证', how: `本页实算：1 万个键里 ${movedRingPct}% 换了节点，全部来自节点 ${movedFrom}。`},
      {claim: '虚拟节点越多，各节点承担的比例越接近', status: '已验证', how: `本页实算：每个节点 1、16、128 个点时，最多和最少分别差 ${spread(p1)}、${spread(p16)}、${spread(p128)} 个百分点。`},
      {claim: '加一个节点，平均搬动 1/(N+1) 的键', status: '通用知识', how: '由对称性可得。本页只算了一组位置，没有对很多组随机位置取平均。'},
      {claim: '图里节点和键的位置', status: '已验证', how: '全部由页面里的哈希函数算出。为了让图看得清，节点名和键名的后缀是挑过的。'},
      {claim: '原始论文、Dynamo 论文、替代方案', status: '通用知识', how: '凭已有知识写的，这次没有重新打开原文核对。'}
    ]
  };
})()
