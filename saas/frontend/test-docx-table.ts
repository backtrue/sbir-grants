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
| 測試二 | 這是一段非常長非常長非常長非常常長非常長長長長長長長長長長長長長長長長的內容 |
`;

async function main() {
    const mdast = unified().use(remarkParse).use(remarkGfm).parse(markdown);
    
    // First try with just width
    const docx1 = await toDocx(mdast as any, {}, {
        plugins: [
            tablePlugin({
                tableProps: {
                    width: { size: 100, type: WidthType.PERCENTAGE }
                }
            })
        ]
    });
    fs.writeFileSync('test1.docx', Buffer.from(await docx1.arrayBuffer()));

    // Try with fixed layout
    const docx2 = await toDocx(mdast as any, {}, {
        plugins: [
            tablePlugin({
                tableProps: {
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    layout: 'autofit' as any // TableLayoutType.AUTOFIT
                }
            })
        ]
    });
    fs.writeFileSync('test2.docx', Buffer.from(await docx2.arrayBuffer()));
    
    console.log("Done");
}

main().catch(console.error);
