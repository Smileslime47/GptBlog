import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { parse } from 'yaml';

const root = new URL('../src/posts/',import.meta.url).pathname;
const paths = [];
function walk(dir) { for(const item of readdirSync(dir,{withFileTypes:true})) { const path=join(dir,item.name); if(item.isDirectory()) walk(path); else if(path.endsWith('.md')) paths.push(path); } }
walk(root);
const rows = paths.map(path => {
  const id=relative(root,path).replaceAll('\\','/');
  const raw=readFileSync(path,'utf8').replace(/^\uFEFF/,'');
  const match=raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const frontmatter=match ? parse(match[1]) || {} : {};
  const content=match ? raw.slice(match[0].length):raw;
  const tags=Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String):typeof frontmatter.tags==='string' ? frontmatter.tags.split(',').map(x=>x.trim()).filter(Boolean):[];
  const date=frontmatter.date || frontmatter.publishedAt || frontmatter.publishDate || frontmatter.createdAt;
  const publishedAt=date && !Number.isNaN(Date.parse(String(date))) ? String(date).slice(0,10):null;
  const excerpt=content.replace(/```[\s\S]*?```/g,' ').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/[#*>`]/g,'').replace(/\s+/g,' ').trim().slice(0,120);
  return { id,title:frontmatter.title || id.split('/').at(-1).replace(/\.md$/,''),category:dirname(id)==='.'?'':dirname(id),tags,publishedAt,content,excerpt,frontmatter };
});
writeFileSync(new URL('../db/seed.json',import.meta.url), JSON.stringify(rows));
console.log(`已准备 ${rows.length} 篇文章，${rows.filter(x=>x.publishedAt).length} 篇有日期。`);
