/* 词库清单（manifest）：列出 lexicons/ 文件夹下所有词库的 id
   新增词库步骤（HTML 无需任何改动）：
     1. 在 lexicons/ 文件夹放入 lex-<id>.js（<id> 为词库唯一标识，全小写英文）
     2. 把 '<id>' 加入下方数组
     3. 重新打开 HTML 即自动加载。清单缺失时 HTML 自动回退「原版」。 */
window.LEX_MANIFEST = ['fantasy', 'xiuxian'];
