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
| 測試一 | 這是短短的內容 |
`;

async function main() {
    const mdast = unified().use(remarkParse).use(remarkGfm).parse(markdown);
    
    // First try with size 5000
    const docx1 = await toDocx(mdast as any, {}, {
        plugins: [
            tablePlugin({
                tableProps: {
                    width: { size: 5000, type: WidthType.PERCENTAGE }
                }
            })
        ]
    });
    fs.writeFileSync('test3.docx', Buffer.from(await docx1.arrayBuffer()));

    // Try with string "100%"
    const docx2 = await toDocx(mdast as any, {}, {
        plugins: [
            tablePlugin({
                tableProps: {
                    width: { size: "100%", type: WidthType.PERCENTAGE } as any
                }
            })
        ]
    });
    fs.writeFileSync('test4.docx', Buffer.from(await docx2.arrayBuffer()));
    
    console.log("Done");
}

main().catch(console.error);
