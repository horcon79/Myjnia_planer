import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChecklistMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-3 break-words text-sm leading-relaxed text-slate-200 [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_pre]:overflow-x-auto [&_pre]:bg-slate-950 [&_pre]:p-3 [&_a]:text-sky-400 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:border-slate-700 [&_td]:p-2 [&_th]:p-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
        img: ({ alt }) => <span>{alt}</span>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
      }}>{markdown}</ReactMarkdown>
    </div>
  );
}
