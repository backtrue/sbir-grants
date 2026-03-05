import * as fs from 'fs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toDocx } from 'mdast2docx';
import { tablePlugin } from '@m2d/table';
import { WidthType } from 'docx';

const markdown = `
| 項目 | 說明 |
| --- | --- |
| 測試一 | 這是一段非常長非常長非常長非常常長非常長長長長長長長長長長長長長長長長的內容 |
`;

async function main() {
    const mdast = unified().use(remarkParse).use(remarkGfm).parse(markdown);
    
    const docx1 = await toDocx(mdast as any, {}, {
        plugins: [
            tablePlugin({
                tableProps: {
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    columnWidths: [4513, 4513, 4513, 4513, 4513] // Define enough for max 5 columns
                } as any
            })
        ]
    });
    fs.writeFileSync('test7.docx', Buffer.from(await docx1.arrayBuffer()));
    console.log("Done");
}

main().catch(console.error);
