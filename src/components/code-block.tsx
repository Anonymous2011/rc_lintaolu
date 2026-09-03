export function CodeBlock({
  file,
  code,
  caption,
}: {
  file: string;
  code: string;
  caption: string;
}) {
  if (!code) return null;

  return (
    <figure className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <figcaption className="flex items-baseline justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5">
        <span className="font-mono text-sm text-zinc-600">{file}</span>
      </figcaption>
      <div className="overflow-x-auto">
        <pre className="px-3 py-3 font-mono text-sm leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>
      <p className="border-t border-zinc-200 px-3 py-2 text-sm leading-relaxed text-zinc-600">
        {caption}
      </p>
    </figure>
  );
}
