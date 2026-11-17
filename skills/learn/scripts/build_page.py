#!/usr/bin/env python3
"""把学习页的数据填进模板，生成一个单文件 HTML。

用法：
  python3 build_page.py <数据文件.js> <输出.html> [--title 标题] [--artifact]

数据文件的内容是一个 JS 表达式：一个对象字面量，或者一个返回对象的立即执行函数。
字段说明见 references/page-data.md，完整例子见 references/example-lesson.js。

--title     浏览器标签页上的名字。不给就用数据里的 title 加上「学习页」。
--artifact  生成给 Artifact 工具发布用的版本：去掉只有独立文件才需要的开头几行。
"""
import argparse
import html
import pathlib
import re
import sys

MARK = '/*__LESSON__*/ null'
TITLE = '<title>学习页</title>'


def main():
    ap = argparse.ArgumentParser(description='把学习页的数据填进模板')
    ap.add_argument('data', help='数据文件（JS 表达式）')
    ap.add_argument('out', help='输出的 HTML 文件')
    ap.add_argument('--title', help='浏览器标签页上的名字')
    ap.add_argument('--artifact', action='store_true', help='生成给 Artifact 工具发布用的版本')
    args = ap.parse_args()

    template = pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'learning-page.html'
    page = template.read_text(encoding='utf-8')
    if page.count(MARK) != 1 or page.count(TITLE) != 1:
        sys.exit('模板里找不到占位标记，模板可能被改过：' + str(template))

    data = pathlib.Path(args.data).read_text(encoding='utf-8').strip()
    if data.endswith(';'):
        data = data[:-1].rstrip()
    if not data:
        sys.exit('数据文件是空的')
    if '</script' in data.lower():
        sys.exit('数据里不能出现 </script，浏览器会把它当成脚本结束。拆开写，比如 "<\\/script>"')

    title = args.title
    if not title:
        m = re.search(r"""\btitle\s*:\s*(['"`])(.+?)\1""", data)
        title = (m.group(2) + '学习页') if m else '学习页'

    page = page.replace(MARK, data).replace(TITLE, '<title>' + html.escape(title, quote=False) + '</title>')
    if args.artifact:
        page = '<title>' + page.split('<title>', 1)[1]

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding='utf-8')
    print('已生成 %s（%d 字节，标题：%s）' % (out, len(page.encode('utf-8')), title))
    print('打开它检查一遍：页面顶部如果出现红色提示，说明数据有问题，照提示改。')


if __name__ == '__main__':
    main()
