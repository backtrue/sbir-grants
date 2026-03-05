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

| Col1 | Col2 | Col3 |
| --- | --- | --- |
| A | B | C |
`;

const customTablePlugin = (options: any = {}) => {
    return {
        block: (ctx: any, node: any, context: any, next: any) => {
            if (node.type !== 'table') return [];
            const colCount = node.children[0]?.children?.length || 1;
            const cw = Math.floor(9026 / colCount);
            const columnWidths = Array(colCount).fill(cw);
            
            const dynamicPlugin = tablePlugin({
                ...options,
                tableProps: {
                    ...options.tableProps,
                    width: { size: 9026, type: WidthType.DXA },
                    columnWidths
                }
            });
            // The tablePlugin returns an object with a block method.
            return dynamicPlugin.block!(ctx, node, context, next);
        }
    }
}

async function main() {
    const mdast = unified().use(remarkParse).use(remarkGfm).parse(markdown);
    
    const docx1 = await toDocx(mdast as any, {}, {
        plugins: [
            customTablePlugin()
        ]
    });
    fs.writeFileSync('test8.docx', Buffer.from(await docx1.arrayBuffer()));
    console.log("Done");
}

main().catch(console.error);
