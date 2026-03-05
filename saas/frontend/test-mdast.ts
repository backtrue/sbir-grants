import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toDocx } from 'mdast2docx';
import { tablePlugin } from '@m2d/table';
import { listPlugin } from '@m2d/list';
import * as fs from 'fs';

async function test() {
    const markdown = `## 3. 創新構想\n\n### 3.1 解決方案概述\n\n本解決方案以「AI驅動型」。\n\n1. **政策感知層**\n   - 第一點\n\n| 測試 | 標題 |\n|---|---|\n| 1 | 2 |`;
    const mdast = unified().use(remarkParse).use(remarkGfm).parse(markdown);

    // Dump mdast to see if remark-parse handles it correctly
    console.log("AST:", JSON.stringify(mdast, null, 2));

    const docxBlob = await toDocx(mdast as any, undefined, { plugins: [tablePlugin(), listPlugin()] }, 'blob') as Blob;
    const arrayBuffer = await docxBlob.arrayBuffer();
    fs.writeFileSync('test.docx', Buffer.from(arrayBuffer));
    console.log("Saved test.docx from buffer.");
    console.log("Saved test.docx");
}

test().catch(console.error);
