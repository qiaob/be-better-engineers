#!/usr/bin/env node
/* 检查一页学习页。

   用法：node check_page.cjs <页面.html> [--shots <截图目录>]

   分两层：
   1. 不需要浏览器：把数据算一遍，检查结构。
   2. 装了 Playwright 时：用浏览器打开，在浅色、深色、手机宽度下各看一遍，
      把每个演示点到最后一步，收集报错、横向溢出、超出图边界的文字。

   「问题」必须改，「提醒」建议改。有问题时退出码为 1。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const argv = process.argv.slice(2);
let file = null, shots = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--shots') shots = argv[++i];
  else if (!file) file = argv[i];
}
if (!file) { console.error('用法：node check_page.cjs <页面.html> [--shots <截图目录>]'); process.exit(2); }

const problems = [], warnings = [];
const html = fs.readFileSync(file, 'utf8');
const KNOWN = ['lang', 'id', 'title', 'oneLine', 'depth', 'minutes', 'updated', 'scope', 'map', 'bridge', 'demos', 'explain', 'practice', 'limits', 'retain', 'checks'];
const STAGE_KEYS = ['scope', 'map', 'bridge', 'demos', 'explain', 'practice', 'limits', 'retain'];
const has = v => Array.isArray(v) ? v.length > 0 : !!v;

/* ---------- 第一层：数据 ---------- */
let D = null;
const m = html.match(/const LESSON = ([\s\S]*?);\s*<\/script>/);
if (!m) problems.push('找不到数据块 const LESSON = …，这个文件可能不是用模板生成的');
else if (/^\/\*__LESSON__\*\/\s*null$/.test(m[1].trim())) problems.push('数据还没填：占位标记还在');
else {
  try { D = vm.runInNewContext('(' + m[1] + ')', {}, {timeout: 10000}); }
  catch (e) { problems.push('数据算不出来：' + e.message); }
}

function checkData(D) {
  if (!D || typeof D !== 'object') { problems.push('数据不是一个对象'); return; }
  for (const k of Object.keys(D)) if (KNOWN.indexOf(k) < 0) warnings.push('不认识的字段 ' + k + '，页面会忽略它。是不是拼错了？可用的字段：' + KNOWN.join('、'));
  if (!D.title) problems.push('缺少 title');
  if (!D.id) warnings.push('没有 id，学的人的进度会按标题保存，改了标题就丢了');
  if (!STAGE_KEYS.some(k => has(D[k]))) problems.push('八个阶段一个都没有');
  if (!has(D.explain) && !has(D.practice)) warnings.push('没有讲回，也没有动手：学的人只能读，学不会');

  const sc = D.scope;
  if (sc) {
    if (!sc.stop) warnings.push('定界里没写「学到哪为止」（scope.stop）');
    if ((sc.core || []).length > 5) warnings.push('圈内有 ' + sc.core.length + ' 样，超过五样，边界可能没定下来');
  }

  const checkGraph = (where, nodes, edges) => {
    nodes = nodes || []; edges = edges || [];
    const ids = {}, cells = {}, linked = {};
    nodes.forEach(n => {
      if (!n.id) problems.push(where + '有节点没有 id');
      if (ids[n.id]) problems.push(where + '有重复的节点 id：' + n.id);
      ids[n.id] = true;
      const c = (n.col || 0) + ',' + (n.row || 0);
      if (cells[c]) problems.push(where + '有两个节点在同一格（列 ' + (n.col || 0) + '，行 ' + (n.row || 0) + '）');
      cells[c] = true;
      if ((n.col || 0) > 3) warnings.push(where + '节点 ' + n.id + ' 在第 ' + ((n.col || 0) + 1) + ' 列，超过四列会出现横向滚动');
    });
    edges.forEach(e => {
      if (!ids[e.from] || !ids[e.to]) problems.push(where + '连线 ' + e.from + ' → ' + e.to + ' 指向了不存在的节点');
      if (!e.label) warnings.push(where + '连线 ' + e.from + ' → ' + e.to + ' 上没写关系');
      linked[e.from] = linked[e.to] = true;
    });
    if (nodes.length > 9) warnings.push(where + '有 ' + nodes.length + ' 个节点，超过九个，考虑拆成两张图');
    if (edges.length) nodes.forEach(n => { if (!linked[n.id]) warnings.push(where + '节点 ' + n.id + ' 没有任何连线'); });
    return ids;
  };
  if (D.map) checkGraph('概念图里', D.map.nodes, D.map.edges);

  if (D.demos !== undefined && !Array.isArray(D.demos)) problems.push('demos 要写成数组');
  (Array.isArray(D.demos) ? D.demos : []).forEach((dm, i) => {
    const where = '演示 ' + (i + 1) + (dm.title ? '「' + dm.title + '」' : '');
    if (['frames', 'sequence', 'graph'].indexOf(dm.kind) < 0) { problems.push(where + '的 kind 只能是 frames、sequence 或 graph'); return; }
    if (!has(dm.steps)) { problems.push(where + '没有 steps'); return; }
    if (dm.steps.length > 10) warnings.push(where + '有 ' + dm.steps.length + ' 步，超过十步，考虑拆开');
    if (dm.steps[0] && dm.steps[0].ask) warnings.push(where + '第 1 步的 ask 不会显示：ask 显示在它的前一步，第 1 步没有前一步');
    if (dm.kind === 'sequence') {
      const actors = dm.actors || [];
      if (!actors.length) problems.push(where + '没有 actors');
      if (actors.length > 5) warnings.push(where + '有 ' + actors.length + ' 个角色，太多会挤');
      dm.steps.forEach((sp, k) => {
        if (actors.indexOf(sp.from) < 0 || actors.indexOf(sp.to) < 0) problems.push(where + '第 ' + (k + 1) + ' 步的 from 或 to 不在 actors 里');
      });
    }
    if (dm.kind === 'graph') {
      const ids = checkGraph(where + '里', dm.nodes, dm.edges);
      dm.steps.forEach((sp, k) => {
        (sp.nodes || []).forEach(id => { if (!ids[id]) problems.push(where + '第 ' + (k + 1) + ' 步点亮了不存在的节点 ' + id); });
        (sp.edges || []).forEach(p => {
          if (!Array.isArray(p) || p.length !== 2) problems.push(where + '第 ' + (k + 1) + ' 步的 edges 要写成 [from, to]');
          else if (!(dm.edges || []).some(e => e.from === p[0] && e.to === p[1])) problems.push(where + '第 ' + (k + 1) + ' 步点亮了不存在的连线 ' + p[0] + ' → ' + p[1]);
        });
      });
    }
    if (dm.kind === 'frames') dm.steps.forEach((sp, k) => {
      const at = where + '第 ' + (k + 1) + ' 步';
      let svg = sp.svg;
      try { if (typeof svg === 'function') svg = svg(); }
      catch (e) { problems.push(at + '的 svg 函数出错：' + e.message); return; }
      if (typeof svg !== 'string' || svg.indexOf('<svg') < 0) { problems.push(at + '没有 svg'); return; }
      if (!/viewBox=/.test(svg)) problems.push(at + '的 svg 没有 viewBox');
      if (!/aria-label=/.test(svg)) warnings.push(at + '的 svg 没有 aria-label，读屏的人不知道这张图在说什么');
      const lit = svg.match(/(?:fill|stroke)\s*(?:=\s*["']|:\s*)(#[0-9a-fA-F]{3,8}|rgb|hsl|black|white|red|blue|green|gray|grey)/g);
      if (lit) warnings.push(at + '写死了颜色（' + Array.from(new Set(lit)).slice(0, 3).join('，') + '），深色模式下可能看不清，改用 page-data.md 里的 class');
    });
  });

  (D.explain || []).forEach((ex, i) => {
    if (!ex.prompt) problems.push('讲回第 ' + (i + 1) + ' 题没有 prompt');
    if ((ex.points || []).length < 2) warnings.push('讲回第 ' + (i + 1) + ' 题的要点少于两个，学的人没法对照');
  });

  const pr = D.practice || {};
  (pr.quiz || []).forEach((q, i) => {
    const opts = q.options || [];
    const n = opts.filter(o => o.correct).length;
    if (n !== 1) problems.push('小测第 ' + (i + 1) + ' 题需要恰好一个正确选项，现在有 ' + n + ' 个');
    if (opts.length < 2) problems.push('小测第 ' + (i + 1) + ' 题的选项少于两个');
    if (opts.some(o => !o.why)) warnings.push('小测第 ' + (i + 1) + ' 题有选项没写 why，学的人选错了不知道错在哪');
  });
  if ((pr.quiz || []).length > 5) warnings.push('小测有 ' + pr.quiz.length + ' 题，一轮最好不超过三到五题');
  (pr.tasks || []).forEach((t, i) => { if (!t.answer) warnings.push('动手第 ' + (i + 1) + ' 题没有参考答案'); });

  const rt = D.retain;
  if (rt && has(rt.card) && !rt.card.some(l => /\{\{.+?\}\}/.test(l))) warnings.push('学习卡里没有 {{ }} 挖空，学的人只能读');

  if (!has(D.checks)) warnings.push('没有核对表（checks）：学的人不知道哪些内容核对过');
  (D.checks || []).forEach((c, i) => {
    if (['已验证', '通用知识', '推测'].indexOf(c.status) < 0) warnings.push('核对表第 ' + (i + 1) + ' 行的 status 是「' + c.status + '」，只用 已验证、通用知识、推测 三个值');
  });
}
if (D) checkData(D);

/* ---------- 第二层：浏览器 ---------- */
function report(rendered) {
  const name = path.basename(file);
  console.log('检查 ' + name + (rendered ? '（数据 + 浏览器）' : '（只检查了数据）'));
  if (problems.length) console.log('\n问题（必须改）：\n' + problems.map(x => '  · ' + x).join('\n'));
  if (warnings.length) console.log('\n提醒（建议改）：\n' + warnings.map(x => '  · ' + x).join('\n'));
  if (!problems.length && !warnings.length) console.log('\n没有发现问题。');
  else if (!problems.length) console.log('\n没有必须改的问题。');
  console.log('\n注意：这个脚本只能发现页面坏没坏，发现不了内容错没错。');
  process.exit(problems.length ? 1 : 0);
}

let pw = null;
try { pw = require('playwright'); } catch (e) { pw = null; }
if (!pw || !D) {
  if (!pw) warnings.push('没装 Playwright，跳过了浏览器检查。至少自己用浏览器打开一次，点完每个演示');
  report(false);
} else {
  (async () => {
    let browser;
    try { browser = await pw.chromium.launch(); }
    catch (e) { warnings.push('浏览器没能启动，跳过了浏览器检查：' + String(e.message).split('\n')[0]); return report(false); }
    const url = 'file://' + path.resolve(file);
    const configs = [['桌面浅色', 1000, 'light'], ['桌面深色', 1000, 'dark'], ['手机', 400, 'light']];
    const seen = new Set();
    const add = (list, msg) => { if (!seen.has(msg)) { seen.add(msg); list.push(msg); } };
    const expected = STAGE_KEYS.filter(k => has(D[k])).length;
    for (const [label, width, scheme] of configs) {
      const ctx = await browser.newContext({viewport: {width, height: 900}, colorScheme: scheme, deviceScaleFactor: 1});
      const page = await ctx.newPage();
      page.on('console', msg => { if (msg.type() === 'error') add(problems, '浏览器报错：' + msg.text()); });
      page.on('pageerror', err => add(problems, '脚本出错：' + err.message));
      await page.goto(url);
      await page.waitForTimeout(150);
      const info = await page.evaluate(() => ({
        problems: window.__lessonProblems || [],
        errs: Array.from(document.querySelectorAll('.err')).map(e => e.textContent.trim()),
        stages: document.querySelectorAll('.stage').length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      }));
      info.errs.forEach(t => add(problems, '页面上显示了错误：' + t.replace(/\s+/g, ' ')));
      if (info.stages !== expected) add(problems, '应该有 ' + expected + ' 个阶段，页面上只画出了 ' + info.stages + ' 个');
      if (info.overflow > 1) add(problems, label + '下页面横向溢出了 ' + info.overflow + 'px');

      const measure = () => page.evaluate(() => {
        const out = [];
        document.querySelectorAll('.fig svg').forEach(svg => {
          const vb = svg.viewBox && svg.viewBox.baseVal;
          if (!vb || !vb.width) return;
          svg.querySelectorAll('text').forEach(t => {
            const b = t.getBBox();
            if (!b.width) return;
            if (b.x < vb.x - 2 || b.y < vb.y - 2 || b.x + b.width > vb.x + vb.width + 2 || b.y + b.height > vb.y + vb.height + 2) {
              const title = svg.closest('.demo') ? (svg.closest('.demo').querySelector('h3') || {}).textContent || '演示' : '概念图';
              out.push('「' + title + '」里的文字「' + t.textContent.trim().slice(0, 20) + '」超出了图的边界');
            }
          });
        });
        return out;
      });
      (await measure()).forEach(x => add(warnings, x));

      const demos = page.locator('.demo');
      const nd = await demos.count();
      for (let i = 0; i < nd; i++) {
        const next = demos.nth(i).locator('.ctl .btn.primary');
        for (let k = 0; k < 30; k++) {
          if (await next.isDisabled()) break;
          await next.click();
          (await measure()).forEach(x => add(warnings, x));
        }
      }
      if (shots) {
        fs.mkdirSync(shots, {recursive: true});
        await page.screenshot({path: path.join(shots, label + '.png'), fullPage: true});
      }
      await ctx.close();
    }
    await browser.close();
    if (shots) console.log('截图在 ' + path.resolve(shots));
    report(true);
  })().catch(e => { problems.push('检查脚本自己出错了：' + e.message); report(false); });
}
