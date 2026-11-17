// 学习页数据：数据库事务的隔离级别。
// 用 build_page.py 填进模板。图里的实测结果抄自同目录的 verify_matrix.json，
// 由 verify_matrix.py 在 PostgreSQL 16.15 和 MySQL 8.0.46 上实际跑出来。
(() => {
  /* ---- 实测结果：四个级别 × 五种异常 ---- */
  const MEASURED = {
    PostgreSQL: {
      'READ UNCOMMITTED': {dirty: '挡住', nonrepeatable: '会', phantom: '会', lost: '会', skew: '会'},
      'READ COMMITTED': {dirty: '挡住', nonrepeatable: '会', phantom: '会', lost: '会', skew: '会'},
      'REPEATABLE READ': {dirty: '挡住', nonrepeatable: '挡住', phantom: '挡住', lost: '报错', skew: '会'},
      'SERIALIZABLE': {dirty: '挡住', nonrepeatable: '挡住', phantom: '挡住', lost: '报错', skew: '报错'}
    },
    MySQL: {
      'READ UNCOMMITTED': {dirty: '会', nonrepeatable: '会', phantom: '会', lost: '会', skew: '会'},
      'READ COMMITTED': {dirty: '挡住', nonrepeatable: '会', phantom: '会', lost: '会', skew: '会'},
      'REPEATABLE READ': {dirty: '挡住', nonrepeatable: '挡住', phantom: '挡住', lost: '会', skew: '会'},
      'SERIALIZABLE': {dirty: '等锁', nonrepeatable: '等锁', phantom: '等锁', lost: '报错', skew: '报错'}
    }
  };
  // SQL-92 标准的表：只规定每个级别「至少」要挡住哪几种读异常
  const STANDARD = {
    'READ UNCOMMITTED': {dirty: '允许', nonrepeatable: '允许', phantom: '允许', lost: '没列', skew: '没列'},
    'READ COMMITTED': {dirty: '不允许', nonrepeatable: '允许', phantom: '允许', lost: '没列', skew: '没列'},
    'REPEATABLE READ': {dirty: '不允许', nonrepeatable: '不允许', phantom: '允许', lost: '没列', skew: '没列'},
    'SERIALIZABLE': {dirty: '不允许', nonrepeatable: '不允许', phantom: '不允许', lost: '没列', skew: '没列'}
  };
  const LEVELS = [['READ UNCOMMITTED', '读未提交'], ['READ COMMITTED', '读已提交'], ['REPEATABLE READ', '可重复读'], ['SERIALIZABLE', '可串行化']];
  const KINDS = [['dirty', '脏读'], ['nonrepeatable', '不可重复读'], ['phantom', '幻读'], ['lost', '丢失更新'], ['skew', '写偏斜']];
  const CELL = {
    '会': ['hot-soft s-hot', '会出现'],
    '挡住': ['ok-soft s-ok', '挡住'],
    '报错': ['acc-soft s-acc', '报错重试'],
    '等锁': ['acc-soft s-acc', '等锁'],
    '允许': ['hot-soft s-hot', '允许出现'],
    '不允许': ['ok-soft s-ok', '必须挡住'],
    '没列': ['tint s-faint', '没提']
  };
  const zh = Object.fromEntries(LEVELS), kz = Object.fromEntries(KINDS);
  // 实测比标准挡得多的格子：标准说「允许」，实测却没出现
  const stricter = db => LEVELS.flatMap(([lv]) => KINDS.slice(0, 3)
    .filter(([k]) => STANDARD[lv][k] === '允许' && MEASURED[db][lv][k] !== '会')
    .map(([k]) => zh[lv] + '的' + kz[k])).join('、');
  const count = (db, v) => LEVELS.reduce((n, [lv]) => n + KINDS.filter(([k]) => MEASURED[db][lv][k] === v).length, 0);

  /* ---- 画图：级别 × 异常的表 ---- */
  const RX = 150, CW = 94, RY = 74, RH = 40;
  const svg = (h, label, inner) => `<svg viewBox="0 0 640 ${h}" role="img" aria-label="${label}">${inner}</svg>`;
  const matrix = (title, table, note, star) => {
    let s = `<text x="16" y="18" class="t-strong">${title}</text>` +
      `<text x="${RX + CW * 1.5}" y="42" text-anchor="middle" class="t-small t-muted">标准里列出的三种</text>` +
      `<text x="${RX + CW * 4}" y="42" text-anchor="middle" class="t-small t-muted">标准里没列的两种</text>` +
      `<line x1="${RX + CW * 3}" y1="34" x2="${RX + CW * 3}" y2="${RY + RH * 4}" stroke-width="1" stroke-dasharray="3 3" class="s-line"/>`;
    KINDS.forEach(([, name], i) => {
      s += `<text x="${RX + CW * i + CW / 2}" y="62" text-anchor="middle" class="t-strong">${name}</text>`;
    });
    LEVELS.forEach(([lv, name], j) => {
      const y = RY + RH * j;
      s += `<text x="16" y="${y + RH / 2 - 7}" dy="0.35em" class="t-strong">${name}</text>` +
        `<text x="16" y="${y + RH / 2 + 10}" dy="0.35em" class="t-small t-mono t-muted">${lv}</text>`;
      KINDS.forEach(([k], i) => {
        const [cls, text] = CELL[table[lv][k]];
        const mark = star && star[0] === lv && star[1] === k ? '*' : '';
        s += `<rect x="${RX + CW * i + 4}" y="${y + 4}" width="${CW - 8}" height="${RH - 8}" rx="6" stroke-width="1" class="${cls}"/>` +
          `<text x="${RX + CW * i + CW / 2}" y="${y + RH / 2}" dy="0.35em" text-anchor="middle">${text}${mark}</text>`;
      });
    });
    return s + `<text x="16" y="${RY + RH * 4 + 22}" dy="0.35em" class="t-small t-muted">${note}</text>`;
  };

  /* ---- 画图：快照时间线 ---- */
  const X0 = 120, X1 = 620, YB = 58, YV1 = 118, YV2 = 158, YA = 222, YT = 268;
  const T = {r1: 180, upd: 280, peek: 360, commit: 420, r2: 540};
  const lane = (y, label) => `<text x="16" y="${y}" dy="0.35em" class="t-strong">${label}</text>` +
    `<line x1="${X0}" y1="${y}" x2="${X1}" y2="${y}" stroke-width="1.5" class="s-faint"/>`;
  const dot = (x, y, label, below) => `<circle cx="${x}" cy="${y}" r="6" class="ink gap"/>` +
    `<text x="${x}" y="${below ? y + 24 : y - 20}" dy="0.35em" text-anchor="middle" class="t-small">${label}</text>`;
  const axis = `<line x1="${X0}" y1="${YT}" x2="${X1 - 14}" y2="${YT}" stroke-width="1.5" class="s-line"/>` +
    `<path d="M${X1 - 14} ${YT - 5} L${X1 - 4} ${YT} L${X1 - 14} ${YT + 5} z" class="ink"/>` +
    `<text x="${X0}" y="${YT + 16}" dy="0.35em" class="t-small t-muted">时间从左往右走</text>`;
  const v1 = `<text x="16" y="${YV1}" dy="0.35em">版本 1：100</text>` +
    `<rect x="${X0}" y="${YV1 - 12}" width="${X1 - X0}" height="24" rx="4" stroke-width="1" class="tint s-line"/>`;
  const v2label = `<text x="16" y="${YV2}" dy="0.35em">版本 2：50</text>`;
  const v2pending = v2label +
    `<rect x="${T.upd}" y="${YV2 - 12}" width="${X1 - T.upd}" height="24" rx="4" stroke-width="1.5" stroke-dasharray="5 4" class="acc-soft s-acc"/>` +
    `<text x="${T.upd + 8}" y="${YV2}" dy="0.35em" class="t-small">未提交</text>`;
  const v2done = v2label +
    `<rect x="${T.upd}" y="${YV2 - 12}" width="${T.commit - T.upd}" height="24" rx="4" stroke-width="1.5" stroke-dasharray="5 4" class="f-none s-acc"/>` +
    `<text x="${T.upd + 8}" y="${YV2}" dy="0.35em" class="t-small t-muted">未提交</text>` +
    `<rect x="${T.commit}" y="${YV2 - 12}" width="${X1 - T.commit}" height="24" rx="4" stroke-width="1.5" class="acc-soft s-acc"/>` +
    `<text x="${T.commit + 8}" y="${YV2}" dy="0.35em" class="t-small">已提交</text>`;
  const snap = (x, label) => `<line x1="${x}" y1="98" x2="${x}" y2="${YA + 12}" stroke-width="1.5" stroke-dasharray="4 3" class="s-ink"/>` +
    `<text x="${x}" y="86" dy="0.35em" text-anchor="middle" class="t-small t-strong">${label}</text>`;
  const seen = (x, y, text, cls) => `<circle cx="${x}" cy="${y}" r="7" class="${cls || 'ink'} gap"/>` +
    `<text x="${x + 12}" y="${y}" dy="0.35em" class="t-strong">${text}</text>`;
  const chip = text => `<text x="${X1}" y="16" dy="0.35em" text-anchor="end" class="t-strong">${text}</text>`;

  const base1 = lane(YB, '事务 B') + v1 + lane(YA, '事务 A') + axis;
  const read1 = snap(T.r1, '快照 1') + dot(T.r1, YA, '第 1 次读', true) + seen(T.r1, YV1, '看到 100');
  const upd = dot(T.upd, YB, 'UPDATE 改成 50');
  const committed = base1 + upd + dot(T.commit, YB, 'COMMIT') + v2done + read1;
  const peek = `<line x1="${T.peek}" y1="${YA - 8}" x2="${T.peek}" y2="${YV2 + 14}" stroke-width="1.5" stroke-dasharray="4 3" class="s-hot"/>` +
    `<circle cx="${T.peek}" cy="${YA}" r="6" stroke-width="2" class="panel s-hot"/>` +
    `<text x="${T.peek}" y="${YA + 24}" dy="0.35em" text-anchor="middle" class="t-small">假如这时读</text>` +
    seen(T.peek, YV2, '读未提交：50', 'hot') +
    `<text x="${T.peek + 12}" y="194" dy="0.35em" class="t-small t-muted">其他级别看不到它，仍是 100</text>`;
  const reuse = `<path d="M${T.r2} ${YA - 7} V200 H${T.r1 + 10}" fill="none" stroke-width="1.5" class="s-ink"/>` +
    `<path d="M${T.r1 + 2} 200 L${T.r1 + 12} 195 L${T.r1 + 12} 205 z" class="ink"/>` +
    `<text x="${(T.r1 + T.r2) / 2}" y="188" dy="0.35em" text-anchor="middle" class="t-small">沿用快照 1：版本 2 不在里面</text>`;

  const tl = (label, inner) => svg(300, label, inner);

  return {
    lang: 'zh-CN',
    id: 'transaction-isolation-levels',
    title: '事务隔离级别',
    oneLine: '多个事务同时读写同一批数据时，数据库承诺让它们互相「看见」多少。级别越高，结果越像一个接一个地执行，代价是更多等待或失败重试。',
    depth: '能验',
    minutes: 45,
    updated: '2026-11-17',

    scope: {
      is: '数据库对并发事务的一组承诺：两个事务同时读写同一批数据时，哪几种「看起来不对」的情况保证不会出现。级别越高，结果越像所有事务一个接一个地执行。',
      isNot: '不是锁。锁和多版本快照是数据库兑现承诺的手段，隔离级别只规定结果。所以同一个级别名字，在 PostgreSQL 和 MySQL 里挡住的东西并不完全一样。',
      why: '完全不隔离，会读到别人没提交、随后又撤销的数据，或者两个人同时改，一个把另一个覆盖掉。让所有事务排队一个个执行最安全，但太慢。隔离级别让你在「正确」和「并发度」之间选一个点。',
      where: 'ACID 里的 I。位置在应用和存储引擎之间：应用用 `BEGIN ISOLATION LEVEL ...`、`SET TRANSACTION ...` 或连接池配置选级别，数据库用锁和多版本快照（MVCC）兑现。',
      applies: '只要有两个以上的事务同时读写同一批数据，并且是「先读，再根据读到的值决定写什么」，就要想到它：扣库存、转账、排班、预订、唯一性检查。只读一次的查询，或者整件事能写成一条 `UPDATE`，通常不用纠结。',
      stop: '能讲清四个级别各挡住哪些异常、快照在什么时候取；看到一段并发读写的代码和它用的级别，能判断会不会出错、出哪种错，并能开两个终端在自己的数据库里验证。',
      core: ['脏读、不可重复读、幻读', '快照什么时候取', '丢失更新、写偏斜，以及怎么防', '四个级别各挡住什么', '默认级别和两家的差异'],
      edge: ['加锁读（`FOR UPDATE`、`FOR SHARE`）的细节', 'MySQL 的间隙锁、next-key lock', 'PostgreSQL 可串行化的实现（SSI）', '「快照隔离」这个学术名字'],
      out: ['分布式事务、两阶段提交', '分布式系统的一致性模型（线性一致性等）', 'MVCC 的存储细节：版本链、undo log、vacuum', '死锁排查和锁调优', 'Oracle、SQL Server 等其他数据库'],
      prereqs: [
        {name: '事务', primer: '一组语句要么全部生效，要么全部不生效。`BEGIN` 开始，`COMMIT` 提交，`ROLLBACK` 撤销。'},
        {name: '提交', primer: '事务里的修改，在 `COMMIT` 那一刻才算正式生效。提交之前随时可能被撤销。'},
        {name: '行锁', primer: '一个事务改某一行时，数据库会锁住这一行。别的事务要改同一行，得等前一个提交或回滚。'}
      ]
    },

    map: {
      nodes: [
        {id: 'read', label: '读异常', col: 0, row: 0, kind: 'core', note: '只读也会碰到。**脏读**：读到别人还没提交的修改。**不可重复读**：同一行读两次，值不一样。**幻读**：同一个条件查两次，行数不一样。'},
        {id: 'conc', label: '并发事务', col: 1, row: 0, note: '两个事务的语句交错执行。所有异常都从这里来：如果事务一个接一个地跑，什么异常都不会有。'},
        {id: 'write', label: '写异常', col: 2, row: 0, kind: 'core', note: '「先读、再根据读到的值写」时会碰到。**丢失更新**：两人改同一行，后写的覆盖了先写的。**写偏斜**：两人各改不同的行，合起来破坏了规则。'},
        {id: 'app', label: '应用代码', col: 0, row: 1, note: '你在这里选级别，也要在这里承担高级别的代价：捕获失败，把整个事务重试。'},
        {id: 'level', label: '隔离级别', col: 1, row: 1, kind: 'core', note: '对外的承诺：保证哪几种异常不出现。标准定义了四个：读未提交、读已提交、可重复读、可串行化。'},
        {id: 'cost', label: '等待与重试', col: 2, row: 1, note: '级别越高，越多的事务要等锁，或者被数据库判定冲突、直接失败，需要重试。'},
        {id: 'lock', label: '锁', col: 0, row: 2, kind: 'prereq', note: '让后来的事务等。改同一行时任何级别都会加行锁；MySQL 的可串行化还会给普通读加锁。'},
        {id: 'mvcc', label: 'MVCC 快照', col: 1, row: 2, kind: 'core', note: '一行可以同时留着好几个版本，每个事务按自己的快照决定看哪个版本，所以读不用等写。快照在什么时候取，决定了读已提交和可重复读的区别。'}
      ],
      edges: [
        {from: 'conc', to: 'read', label: '交错时产生'},
        {from: 'conc', to: 'write', label: '交错时产生'},
        {from: 'level', to: 'read', label: '承诺挡住'},
        {from: 'level', to: 'write', label: '高级别才挡'},
        {from: 'app', to: 'level', label: '选一个'},
        {from: 'level', to: 'cost', label: '越高越多'},
        {from: 'lock', to: 'level', label: '用来兑现'},
        {from: 'mvcc', to: 'level', label: '用来兑现'}
      ]
    },

    bridge: {
      intro: '你多半写过多线程代码、用过 Git。隔离级别要解决的，就是你在那里见过的老问题。',
      pairs: [
        {known: '多线程里的互斥锁（mutex）', new: '隔离级别',
         same: '都是为了让并发的操作互不踩踏。不加保护，就会读到改了一半的状态，或者把别人的修改覆盖掉。',
         differ: '锁要你自己决定锁什么、锁多久。隔离级别是声明式的：你只说要什么保证，数据库自己决定用锁还是用快照。而且高级别下它可能直接让你的事务失败，要你重试。'},
        {known: 'Git：从 main 拉一个分支干活', new: '可重复读：事务用一份固定的快照',
         same: '分支上看到的代码，不会因为别人往 main 推了新提交而变。可重复读的事务看到的数据，也不会因为别人提交了而变。',
         differ: 'Git 合并时，两人改的是不同的文件就不报冲突，哪怕合起来编译不过。可重复读也一样：两个事务改的是不同的行，它就放行，合起来破坏了规则也看不出来。这就是写偏斜。'},
        {known: '代码里的竞态：`if (stock > 0) stock--`', new: '丢失更新',
         same: '都是「先读、再判断、再写」，中间被别人插了一脚。',
         differ: '在数据库里，把读和写合成一条 `UPDATE item SET stock = stock - 1 WHERE stock > 0`，第二个人会排队，并在最新的值上判断。分成 `SELECT` 和 `UPDATE` 两条，默认级别不保护你。'}
      ],
      predict: {
        q: 'PostgreSQL 默认的「读已提交」下：事务 A 读到余额 100；事务 B 把余额改成 50 并提交；A 在同一个事务里再读一次。A 看到多少？换成「可重复读」呢？',
        a: '读已提交看到 **50**，可重复读看到 **100**。读已提交每条语句开始时都取一份新快照；可重复读整个事务都用第一条语句时取的那一份。本页在 PostgreSQL 16 和 MySQL 8.0 上实际跑过，两家结果相同。下面第一个演示画的就是这件事。'
      }
    },

    demos: [
      {
        title: '快照：同一行的两个版本，谁看得见哪个',
        kind: 'frames',
        steps: [
          {svg: tl('A 第一次读，取了快照 1，看到版本 1：100', base1 + read1),
           caption: '一行数据在数据库里可以同时有好几个版本。A 读的时候拿到一份**快照**：取快照那一刻已经提交的版本，它都看得见。现在只有版本 1，A 看到 100。'},
          {svg: tl('B 改成 50，多出一个未提交的版本 2', base1 + upd + v2pending + read1),
           caption: 'B 把余额改成 50，还没提交。数据库不会马上抹掉旧值：它多出一个版本 2，标着「未提交」；版本 1 还留着，给需要它的快照看。'},
          {ask: 'B 还没提交。假如 A 这时读一次，会看到 50 吗？',
           svg: tl('只有读未提交会读到未提交的版本 2', base1 + upd + v2pending + read1 + peek),
           caption: '只有**读未提交**会读到没提交的版本 2，看到 50，这就是**脏读**。B 要是随后回滚，A 读到的 50 从来没真正存在过。其他级别都看不到它。实测 MySQL 的读未提交会脏读；PostgreSQL 根本不实现脏读，设成读未提交也只看到 100。'},
          {svg: tl('B 提交，版本 2 变成已提交', committed),
           caption: 'B 提交了。从这一刻起取的快照，都看得见版本 2；在这之前取的快照，仍然看不见它。'},
          {ask: '**读已提交**下，A 的每条语句开始时都取一份新快照。A 第 2 次读，看到多少？',
           svg: tl('读已提交：第 2 次读取了快照 2，看到 50', committed + chip('级别：读已提交') + snap(T.r2, '快照 2') + dot(T.r2, YA, '第 2 次读', true) + seen(T.r2, YV2, '看到 50')),
           caption: '50。快照 2 取在 B 提交之后，看得见版本 2。同一个事务里两次读到不同的值，这就是**不可重复读**。同理，B 要是插入了一行新数据，A 第 2 次按条件查就会多出一行，这就是**幻读**。'},
          {ask: '换成**可重复读**：整个事务只用第一条语句时取的那份快照。A 第 2 次读呢？',
           svg: tl('可重复读：第 2 次读沿用快照 1，看到 100', committed + chip('级别：可重复读') + dot(T.r2, YA, '第 2 次读', true) + reuse + seen(T.r2, YV1, '看到 100')),
           caption: '还是 100。A 沿用快照 1，版本 2 不在里面，B 后来插入的行也不在，所以不可重复读和幻读都没了。代价是 A 看到的可能是旧数据。注意快照取在事务的第一条查询，不是 `BEGIN` 那一刻：两家实测都是这样。'}
        ]
      },
      {
        title: '丢失更新：两个人同时卖出一件',
        kind: 'sequence',
        actors: ['事务 A', '数据库', '事务 B'],
        steps: [
          {from: '事务 A', to: '数据库', label: '读库存 → 10',
           caption: '库存是 10。A 要卖出一件：先读库存，读到 10，在应用里算出 10 − 1 = 9。两个事务都用默认的读已提交。'},
          {from: '事务 B', to: '数据库', label: '读库存 → 10',
           caption: 'B 同时也要卖一件。A 还没写，B 也读到 10，也算出 9。'},
          {from: '事务 A', to: '数据库', label: '写回 9，COMMIT',
           caption: 'A 执行 `UPDATE item SET stock = 9`，提交。'},
          {ask: 'B 也把它算出的 9 写回去。数据库会拦住它吗？最终库存是多少？',
           from: '事务 B', to: '数据库', label: '写回 9，COMMIT',
           caption: '不拦，最终是 **9**。卖出两件，库存只少了一件：A 的修改被覆盖了，这叫**丢失更新**。读已提交只保证你读不到没提交的数据，不管你读到的值后来有没有过时。PostgreSQL 和 MySQL 实测都是 9；MySQL 换成可重复读，也还是 9。'},
          {ask: '换成 PostgreSQL 的可重复读，重放一遍。B 写回 9 的这一步会怎样？',
           from: '数据库', to: '事务 B', label: 'ERROR 40001',
           caption: '报错：`could not serialize access due to concurrent update`。B 要改的那一行，在 B 的快照之后被 A 改过并提交了，PostgreSQL 拒绝让 B 在旧值上覆盖。B 必须把整个事务重来一遍，重读到 9，写回 8。'},
          {ask: '不调级别，还在读已提交下，怎么改代码最省事？',
           from: '事务 B', to: '数据库', label: 'UPDATE stock = stock - 1',
           caption: '两边都让数据库来算。第二条 `UPDATE` 会等第一个事务提交，再在最新的值上减一，实测最终是 8。另一个办法是读的时候就锁住这一行：`SELECT ... FOR UPDATE`，B 会停在读这一步，等 A 提交后读到 9。'}
        ]
      },
      {
        title: '写偏斜：两位医生同时请假',
        kind: 'sequence',
        actors: ['Alice 的事务', '数据库', 'Bob 的事务'],
        steps: [
          {from: 'Alice 的事务', to: '数据库', label: '数值班人数 → 2',
           caption: '医院的规则：任何时候至少一名医生值班。现在 Alice 和 Bob 都在值班。Alice 想请假，先数一下：2 人，她走了还剩 1 人，符合规则。两个事务都用可重复读。'},
          {from: 'Bob 的事务', to: '数据库', label: '数值班人数 → 2',
           caption: 'Bob 同时也想请假，也数到 2 人。两份快照都取在任何人改动之前。'},
          {from: 'Alice 的事务', to: '数据库', label: 'Alice 下班，COMMIT',
           caption: 'Alice 把自己那一行改成不值班，提交。'},
          {ask: 'Bob 把自己那一行改成不值班并提交。可重复读会拦住他吗？',
           from: 'Bob 的事务', to: '数据库', label: 'Bob 下班，COMMIT',
           caption: '不拦。两人改的是不同的行，没有写冲突，可重复读只拦同一行上的冲突。两边都提交成功，值班的人变成 **0**，规则被破坏了。每个事务单独看都没错，合起来才错，这叫**写偏斜**。PostgreSQL 和 MySQL 的可重复读实测都是 0 人。'},
          {ask: '换成可串行化，重放一遍。会在哪一步出事？',
           from: '数据库', to: 'Bob 的事务', label: 'COMMIT 失败：40001',
           caption: 'PostgreSQL 发现：两人各自读到的东西，都被对方随后改了；按任何先后顺序一个个执行，都不可能出现「两人都走了」。于是让后提交的 Bob 失败：`could not serialize access due to read/write dependencies among transactions`。MySQL 换了个办法：可串行化给普通读也加锁，实测两人互相等，死锁报错，Bob 被回滚。'},
          {from: 'Bob 的事务', to: '数据库', label: '重试：数值班人数 → 1',
           caption: 'Bob 的应用捕获错误，把整个事务从头重来。这次数到 1 人，按规则不能请假。可串行化保证了结果正确，前提是应用会重试。'}
        ]
      },
      {
        title: '四个级别，实际挡住了什么',
        kind: 'frames',
        steps: [
          {svg: svg(270, 'SQL 标准规定的最低要求', matrix('SQL 标准（1992）：每个级别至少要挡住什么', STANDARD, '「允许出现」是允许，不是一定出现：数据库可以挡得比标准多。')),
           caption: '先看标准。它只按三种读异常定义了四个级别，而且只规定「至少要挡住什么」，数据库可以挡得更多。丢失更新和写偏斜，标准的这张表里根本没提。'},
          {ask: '猜一猜：PostgreSQL 的可重复读，挡得住幻读吗？挡得住写偏斜吗？',
           svg: svg(270, 'PostgreSQL 16 实测结果', matrix('PostgreSQL 16 实测', MEASURED.PostgreSQL, '报错重试：后写或后提交的事务失败，SQLSTATE 40001，要把整个事务重来。')),
           caption: `挡得住幻读，挡不住写偏斜。比标准挡得多的格子：${stricter('PostgreSQL')}。读未提交和读已提交表现完全一样。可重复读遇到丢失更新时，让后写的事务报错。20 个格子里，「会出现」有 ${count('PostgreSQL', '会')} 个。`},
          {ask: 'MySQL 默认就是可重复读。猜一猜：它挡得住丢失更新吗？',
           svg: svg(270, 'MySQL 8.0 实测结果', matrix('MySQL 8.0（InnoDB）实测', MEASURED.MySQL, '* 普通 SELECT 看不到别人新插入的行，但 UPDATE 会改到它，改完再查就看得见了。', ['REPEATABLE READ', 'phantom'])),
           caption: `挡不住：后写的人直接覆盖，不报错，这一点和 PostgreSQL 不同。读未提交真的会脏读。可串行化靠给读加锁，别人要等；两边互相等就是死锁，其中一个报错回滚（错误 1213，SQLSTATE 同样是 40001）。比标准挡得多的格子：${stricter('MySQL')}。20 个格子里，「会出现」有 ${count('MySQL', '会')} 个。`}
        ]
      }
    ],

    explain: [
      {prompt: '不看页面，用三四句话讲清：读已提交和可重复读，差别到底在哪？各自会出现什么、挡住什么？',
       points: [
         '两者都按快照读，都看不到别人没提交的修改，所以都没有脏读。',
         '读已提交每条语句取一份新快照，所以同一个事务里两次读可能不同：不可重复读和幻读都会出现。',
         '可重复读整个事务用第一条查询时取的那份快照，两次读一样；PostgreSQL 和 MySQL 的普通读连幻读也挡住了。',
         '要改的行在快照之后被别人改过：PostgreSQL 的可重复读报错让你重试，MySQL 的可重复读直接覆盖。'
       ]},
      {prompt: '给一个没学过的同事讲：为什么把级别调到可重复读，还是可能违反「至少一人值班」这种规则？要彻底挡住该怎么办？',
       points: [
         '两个事务读的是各自的快照，都以为还有 2 人。',
         '它们改的是不同的行，没有写冲突，可重复读只拦同一行上的冲突，所以都放行。',
         '这叫写偏斜：每个事务单独看都没错，合起来破坏了规则。',
         '挡住它：用可串行化并在失败时重试整个事务；或者用 `SELECT ... FOR UPDATE` 锁住读到的那些行；规则能写成约束时，交给数据库约束。'
       ]}
    ],

    practice: {
      quiz: [
        {q: 'PostgreSQL 里把一个事务设成 `READ UNCOMMITTED`，它能读到别人还没提交的修改吗？',
         options: [
           {text: '能，这正是读未提交的意思', why: '标准只说这个级别「允许」脏读，没说必须。PostgreSQL 把它当成读已提交来执行，实测读不到。真的会读到的是 MySQL。'},
           {text: '不能，PostgreSQL 把它当成读已提交执行', correct: true, why: '实测：B 改成 50 还没提交时，A 读到的仍是 100。标准规定的是每个级别「至少」要挡住什么，数据库可以挡得更多。'},
           {text: '会报错，PostgreSQL 不支持这个级别', why: '不报错，语法照样接受，只是行为和读已提交一样。'}
         ]},
        {q: '一段扣库存的代码：先 `SELECT stock`，在应用里算出 `stock - 1`，再 `UPDATE ... SET stock = 新值`。跑在 MySQL 的默认级别下，两个请求同时到。会怎样？',
         options: [
           {text: '安全：MySQL 默认是可重复读，比读已提交更严', why: '可重复读挡的是「同一个事务里两次读不一样」。MySQL 的 `UPDATE` 直接改最新的那一行，不检查它在你的快照之后有没有被改过，所以照样覆盖。实测最终少扣了一件。'},
           {text: '可能丢失更新：两人都读到 10，都写回 9', correct: true, why: '实测 MySQL 8.0 的读已提交和可重复读都是这样，而且不报错。要么改成 `SET stock = stock - 1`，要么先 `SELECT ... FOR UPDATE`。'},
           {text: '第二个请求会报错，需要重试', why: '这是 PostgreSQL 可重复读的行为。MySQL 的可重复读不做这个检查：同一个级别名字，两家行为不同。'},
           {text: '会死锁', why: '只有一行，第二个事务的 `UPDATE` 最多等第一个提交，不会形成互相等待。'}
         ]},
        {q: '下面哪种情况，用默认的读已提交就够了，不需要调高级别？',
         options: [
           {text: '库存减一，写成一条 `UPDATE item SET stock = stock - 1 WHERE id = 1 AND stock > 0`', correct: true, why: '读和写在同一条语句里。第二个事务会等第一个提交，再在最新的值上重新判断条件。实测库存只剩 1 件时两人同时买，只有一人买到，库存停在 0。'},
           {text: '一张报表在一个事务里跑好几条查询，要求各条查询的数字彼此对得上', why: '读已提交每条语句都取新快照，中间别人提交了，后面的查询就和前面的对不上。用可重复读，让整个事务用同一份快照。'},
           {text: '排班：先数值班人数，人数够才允许请假', why: '先读后写、改的又是不同的行，这是写偏斜。读已提交和可重复读都挡不住，实测两人都请假成功。'}
         ]}
      ],
      tasks: [
        {task: '动手：在你自己的数据库里开两个终端（`psql` 或 `mysql`），按演示 2 的顺序手敲一遍，先让它丢一次更新，再用两种办法修好。大约 10 分钟。',
         hints: [
           '建表：`CREATE TABLE item(id int PRIMARY KEY, stock int); INSERT INTO item VALUES (1, 10);`',
           '弄坏：两边都先 `BEGIN;` 再 `SELECT stock FROM item WHERE id = 1;`。A 执行 `UPDATE item SET stock = 9 WHERE id = 1; COMMIT;`，B 再做同样的事。最后看库存。',
           '修法一：把两边的 `SELECT` 都改成 `SELECT ... FOR UPDATE`，看 B 停在哪一步。修法二：两边都只执行 `UPDATE item SET stock = stock - 1 WHERE id = 1`。'
         ],
         answer: '弄坏之后库存是 **9**，少扣了一件。用 `FOR UPDATE`：B 的 `SELECT` 会卡住，直到 A 提交，然后读到 9，写回 8。用原子更新：B 的 `UPDATE` 卡住，A 提交后在 9 上减一，得到 **8**。用 PostgreSQL 的还可以试第三种：两边都 `BEGIN ISOLATION LEVEL REPEATABLE READ;`，B 写的时候会报 `could not serialize access due to concurrent update`。'},
        {task: '会议室预订：插入一条预订之前，先查这个时段有没有冲突的预订，没有就 `INSERT`。两个人同时订同一间、同一时段。PostgreSQL 的可重复读下会怎样？`SELECT ... FOR UPDATE` 能救吗？',
         hints: ['两人查到的都是「没有冲突」。他们写的是同一行吗？', '`FOR UPDATE` 锁的是查到的行。查到的是空的时候，它锁住了什么？'],
         answer: '两人都插入成功，同一时段被订了两次（实测）。这是由幻读引起的写偏斜：可重复读只拦对同一行的并发修改，两条新插入的行互不冲突。`FOR UPDATE` 救不了：查询结果是空的，没有行可锁。办法：用**可串行化**并重试（实测第二个提交会报 40001）；或者让约束来拦，比如 PostgreSQL 的排他约束 `EXCLUDE`，或者把「会议室 + 时段」做成唯一键；或者先锁住一行代表这间会议室的记录。'},
        {task: '线上报警：转账服务切到 PostgreSQL 的可串行化之后，日志里偶尔出现 `could not serialize access`，对应的转账失败了，用户看到「系统繁忙」。是数据库出 bug 了吗？该怎么改？',
         hints: ['可串行化挡不住某种交错时，它怎么做？', '这个错误的 SQLSTATE 是 40001。重试的时候，从哪一条语句开始？'],
         answer: '不是 bug，这是可串行化在按设计工作：它发现某个事务继续下去，会产生任何先后顺序都不可能出现的结果，就让它失败。应用要**捕获 40001，把整个事务从 `BEGIN` 开始重试**，不是只重试最后一条语句，因为之前读到的东西已经过时了。通常重试几次，中间加一点随机等待；事务写得越短，冲突越少。'}
      ]
    },

    limits: {
      fails: [
        {when: '先读、在应用里算出新值、再写回，用读已提交，或者用 MySQL 的可重复读', then: '两个事务同时做，后写的覆盖先写的，丢失更新，而且不报错', instead: '写成一条 `UPDATE ... SET x = x - 1`；或者先 `SELECT ... FOR UPDATE`；或者用 PostgreSQL 的可重复读并重试'},
        {when: '规则跨好几行（至少一人值班、时段不能重叠），用可重复读', then: '各自改不同的行，没有写冲突，都提交成功，规则被破坏：写偏斜', instead: '可串行化加重试；锁住相关的行；能写成约束的写成约束'},
        {when: '用了可串行化，但应用不处理失败', then: '并发一高，事务频繁报 40001，用户看到的就是请求失败', instead: '捕获 40001，把整个事务重试；让事务尽量短'},
        {when: '用可重复读跑一个很长的事务，比如大报表', then: '快照一直不释放：读到的数据越来越旧；PostgreSQL 里旧版本清理不掉，表会膨胀', instead: '报表放到只读副本上跑；把长事务拆短'},
        {when: '把代码从 PostgreSQL 搬到 MySQL，或者反过来，级别名字不变', then: '默认级别不同，同名级别的行为也不同：丢失更新一边报错一边不报，可串行化一边靠检测一边靠加锁', instead: '把关键的并发场景写成测试，在目标数据库上开两个连接实际跑一遍'}
      ],
      myths: [
        {myth: '级别越高越不会出错，所以一律开到可串行化。', truth: '可串行化确实挡住所有异常，代价是事务会失败或互相等。应用不写重试，就是把数据错误换成了请求失败。多数场景用默认级别，加上正确的写法（原子更新、`FOR UPDATE`）就够了。'},
        {myth: '标准表里可重复读只剩幻读没挡，所以除了幻读，可重复读不会有别的问题。', truth: '标准表只列了三种读异常。丢失更新和写偏斜不在表里，可重复读下照样可能发生：MySQL 的可重复读两种都会，PostgreSQL 的可重复读会写偏斜。'},
        {myth: '同一个级别名字，在哪个数据库里行为都一样。', truth: '标准只规定每个级别至少要挡住什么。PostgreSQL 的读未提交等于读已提交，可重复读连幻读也挡住；MySQL 的读未提交真的会脏读，可重复读不检查丢失更新。'},
        {myth: '`BEGIN` 那一刻就拍下了快照。', truth: 'PostgreSQL 和 MySQL 都是在事务里第一条查询时才取快照。`BEGIN` 之后、第一条查询之前别人提交的修改，你看得见。'}
      ],
      deeper: [
        {label: 'PostgreSQL 官方文档「Transaction Isolation」一节', note: '在并发控制（Concurrency Control）一章里，有一张表列出 PostgreSQL 每个级别实际挡住什么，比标准更具体。'},
        {label: 'MySQL 官方文档「Transaction Isolation Levels」（InnoDB 部分）', note: '讲一致性读和加锁读的区别，解释为什么可重复读下 `UPDATE` 会改到快照里看不到的行。'},
        {label: 'Berenson 等，1995，A Critique of ANSI SQL Isolation Levels', note: '指出标准定义的漏洞，提出了快照隔离，以及丢失更新、写偏斜这些名字。'},
        {label: '《数据密集型应用系统设计》第 7 章「事务」', note: 'Martin Kleppmann 著，用很多例子讲各种并发异常和隔离级别，值班医生的例子就出自这一章。'}
      ]
    },

    retain: {
      card: [
        '读已提交每条{{语句}}取一份新快照；可重复读整个事务只用{{第一条查询}}时取的那一份。',
        '没提交的版本不在别人的快照里，所以读已提交及以上没有{{脏读}}。',
        '先读、在应用里算、再写回，读已提交下会{{丢失更新}}；最省事的修法是写成一条 `UPDATE`。',
        '两个事务各改不同的行、合起来破坏规则，叫{{写偏斜}}，可重复读挡不住。',
        '可串行化挡住所有异常，代价是事务会失败，应用必须{{重试整个事务}}。',
        'PostgreSQL 默认{{读已提交}}，MySQL 默认{{可重复读}}；同名级别，行为也不一样。'
      ],
      review: [1, 7, 30]
    },

    checks: [
      {claim: 'PostgreSQL 默认读已提交，MySQL 默认可重复读', status: '已验证', how: '在 PostgreSQL 16.15 上查 `default_transaction_isolation`，在 MySQL 8.0.46 上查 `@@global.transaction_isolation`。'},
      {claim: '读已提交每条语句取新快照，可重复读整个事务用一份快照', status: '已验证', how: '两家都实测：B 提交后，A 在读已提交下读到 50，在可重复读下读到 100（verify_pg.txt、verify_mysql.txt 的 S2）。'},
      {claim: '快照取在第一条查询，不是 BEGIN', status: '已验证', how: '两家都实测：A 先 BEGIN，B 再改成 50 并提交，A 的第一条查询读到 50（verify_pg.txt 的 S4，verify_extra.txt 的 E3）。'},
      {claim: '演示 4 里两张实测表的每一格', status: '已验证', how: '由 verify_matrix.py 在两家各跑 4 个级别 × 5 种异常，共 40 个场景，结果见 verify_matrix.txt。每个场景只跑了一种固定的交错顺序。'},
      {claim: 'MySQL 可重复读下普通读看不到新插入的行，UPDATE 却会改到它', status: '已验证', how: '实测：A 数到 2 行；B 插入一行并提交；A 再数仍是 2，`UPDATE` 却影响了 3 行，之后再数是 3（verify_mysql.txt 的 S5）。'},
      {claim: '原子 UPDATE 和 FOR UPDATE 能防丢失更新', status: '已验证', how: '原子更新两家都实测过（verify_extra.txt 的 E1，verify_pg.txt 的 S7）；`FOR UPDATE` 只在 PostgreSQL 上实测过（S8），MySQL 上没有跑。'},
      {claim: '会议室预订：可重复读下重复预订，可串行化拦下', status: '已验证', how: '在 PostgreSQL 上实测（verify_extra.txt 的 E2）。MySQL 上没有跑这个场景。'},
      {claim: 'FOR UPDATE 锁住值班的行能挡写偏斜', status: '已验证', how: '在 PostgreSQL 读已提交下实测：B 等 A 提交后只数到 1 人。另外实测 `count(*)` 不能和 `FOR UPDATE` 一起用，要先查出行（verify_extra.txt 的 E4）。'},
      {claim: 'SQL 标准里四个级别和三种读异常的对应表', status: '通用知识', how: '凭已有知识写的，这次没有打开标准原文核对。'},
      {claim: 'PostgreSQL 可串行化靠追踪读写依赖来判断冲突', status: '通用知识', how: '失败的结果是实测的；它内部怎么判断，凭已有知识写的。'},
      {claim: '长事务会让 PostgreSQL 的旧版本清理不掉、表膨胀', status: '通用知识', how: '这次没有实测。'},
      {claim: '延伸资料', status: '通用知识', how: '凭已有知识写的，这次没有重新打开原文核对。'}
    ]
  };
})()
