# 学习页：写数据、生成、检查、交付

学习页是一个单文件网页。你只写数据，页面由模板 `assets/learning-page.html` 生成。完整的例子是 `example-lesson.js`，先看一遍它，再照着写。

## 四步

1. **写数据**：一个 `.js` 文件，内容是一个对象字面量，或者一个返回对象的立即执行函数。图里要用的数字需要现算时，用函数。
2. **生成**：`python3 <skill 目录>/scripts/build_page.py 数据.js 输出.html`
3. **检查**：`node <skill 目录>/scripts/check_page.cjs 输出.html`。它会把数据算一遍、检查结构，装了 Playwright 时还会用浏览器打开，在浅色、深色、手机宽度下各看一遍，并把每个演示点到最后一步。有「问题」就改数据，重新生成，再检查。「提醒」看情况改。
4. **交付**
   - 能直接给文件的环境：把 HTML 文件的路径告诉用户，浏览器打开就能用。
   - 有 Artifact 工具的环境：生成时加 `--artifact`，再发布这个文件。

检查脚本只能发现页面坏没坏，发现不了内容错没错。内容对不对，靠你写数据时把关：能算的算，能跑的跑，并在 `checks` 里如实写清每个关键说法核对到了什么程度。

## 字段

只有 `title` 必填。八个阶段各对应一个字段，哪个字段没写，页面就没有那个阶段。

### 页头

| 字段 | 说明 |
|---|---|
| `id` | 英文短名，比如 `consistent-hashing`。学的人的进度按它保存在浏览器里 |
| `title` | 主题名 |
| `oneLine` | 一句话说它是什么 |
| `depth` | `知道有`、`能验` 或 `能做` |
| `minutes` | 预计用时，数字 |
| `updated` | 日期，`YYYY-MM-DD` |
| `lang` | 默认 `zh-CN` |

### 文字格式

除了演示里的 `svg`，所有文字都只认三种写法：`**粗体**`、`` `代码` ``、`\n` 换行。其他 HTML 会原样显示成文字。

任何地方都不能出现 `</script`，生成脚本会拒绝。

### 1 定界 `scope`

```js
scope: {
  is: '是什么', isNot: '不是什么', why: '为什么有它', where: '它在哪',
  applies: '管到哪', stop: '学到哪为止',
  core: ['圈内，最多五样'], edge: ['圈边'], out: ['圈外'],
  prereqs: [{name: '前置知识', primer: '一句话补课'}]
}
```

### 2 全景 `map`

```js
map: {
  nodes: [{id: 'ring', label: '哈希环', col: 1, row: 1, kind: 'core', note: '点它时显示的说明'}],
  edges: [{from: 'hash', to: 'ring', label: '落在'}]
}
```

- 节点放在格子里，`col` 和 `row` 从 0 开始，一格一个节点。四列以内不会出现横向滚动。
- `kind`：`core` 是核心，画粗框；`prereq` 是前置知识，画虚线框；不写就是普通的相关概念。
- `label` 太长会自动折成两行，也可以用 `\n` 自己折。每行最好不超过八个字。
- 最多九个节点。

### 3 连旧 `bridge`

```js
bridge: {
  intro: '一句开场',
  pairs: [{known: '已经会的', new: '新东西', same: '哪里一样', differ: '哪里不一样'}],
  predict: {q: '预测题', a: '揭晓的内容'}
}
```

### 4 演示 `demos`

一个数组，可以有好几个演示。每个演示有 `title`、`kind` 和 `steps`。每一步都可以写：

- `caption`：这一步的说明，显示在图下面。
- `ask`：先猜的问题。写在**揭晓答案的那一步**上，页面会在它的前一步显示这个问题，学的人想好了再点下一步。

三种 `kind`：

**`sequence`**：时序图。

```js
{kind: 'sequence', title: '一次读请求', actors: ['客户端', '路由层', '节点 A'],
 steps: [{from: '客户端', to: '路由层', label: 'get(k)', caption: '……'},
         {from: '路由层', to: '路由层', label: '算哈希', caption: '自己指向自己的消息'}]}
```

`from` 和 `to` 必须是 `actors` 里的名字。角色最多四五个。

**`graph`**：在一张关系图上，每一步点亮一部分。

```js
{kind: 'graph', title: '……', nodes: [/* 同 map.nodes */], edges: [/* 同 map.edges */],
 steps: [{nodes: ['key', 'hash'], edges: [['key', 'hash']], caption: '……'}]}
```

**`frames`**：每一步是你自己画的一张 SVG，最灵活。

```js
{kind: 'frames', title: '……',
 steps: [{svg: '<svg viewBox="0 0 640 320" role="img" aria-label="这张图说明什么">…</svg>', caption: '……'}]}
```

`svg` 也可以是一个返回字符串的函数。画 `frames` 的规矩：

- 宽度用 640 左右，高度按内容定。手机上会横向滚动，不会缩到看不清。
- 文字默认 13px。所有文字都要落在 `viewBox` 里面，检查脚本会量。
- **不要写死颜色**。深色模式下写死的颜色可能看不清。用下面这些 class，它们会跟着主题变：

| 用途 | class |
|---|---|
| 文字 | `t-muted` 次要、`t-strong` 加粗、`t-small` 小字、`t-num` 等宽数字、`t-mono` 等宽字体、`t-inv` 反色 |
| 填充 | `panel` 底色、`tint` `tint2` 浅灰、`ink` 前景色、`acc` `acc-soft` 强调、`hot` `hot-soft` 出错、`ok` `ok-soft` 正常、`f-none` 不填充 |
| 三种并列的东西 | `c1` `c2` `c3`（填充），`sc1` `sc2` `sc3`（描边）。超过三种，改用文字区分 |
| 描边 | `s-line` 普通、`s-faint` 更淡、`s-ink` 前景色、`s-acc` 强调、`s-hot` 出错、`s-ok` 正常 |
| 间隔 | `gap`：画一圈底色的描边，让挨着的图形分开 |

线宽、虚线这类和颜色无关的属性，照常写在属性里，比如 `stroke-width="2"`。

### 5 讲回 `explain`

```js
explain: [{prompt: '讲回题', points: ['要点一', '要点二', '要点三']}]
```

学的人写完后可以展开要点自己对照，也可以一键复制，贴回对话里请你批改。

### 6 动手 `practice`

```js
practice: {
  quiz: [{q: '题目', options: [
    {text: '选项', why: '为什么错'},
    {text: '选项', correct: true, why: '为什么对'}]}],
  tasks: [{task: '题目', hints: ['提示一', '提示二'], answer: '参考答案'}]
}
```

每道选择题恰好一个 `correct: true`。

### 7 探边 `limits`

```js
limits: {
  fails: [{when: '在什么情况下', then: '会怎样', instead: '换什么做法'}],
  myths: [{myth: '误解', truth: '真相'}],
  deeper: [{label: '资料或方向', note: '为什么值得看'}]
}
```

`deeper` 只写你确定存在的资料。

### 8 留存 `retain`

```js
retain: {
  card: ['节点和键落在同一个{{环}}上。'],
  review: [1, 7, 30]
}
```

`{{ }}` 里的词会变成可以点开的空格。`review` 是复习间隔的天数，不写就用 `[1, 7, 30]`。

### 核对表 `checks`

```js
checks: [{claim: '说法', status: '已验证', how: '怎么验证的'}]
```

`status` 只用三个值：`已验证`（这次实际运行过、算过，或者读到了原文）、`通用知识`、`推测`。页脚会把它们列成一张表。
