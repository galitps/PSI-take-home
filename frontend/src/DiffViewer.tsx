export function DiffViewer({ diffText, filePath }: { diffText: string; filePath?: string }) {
  if (!diffText) return null;

  const lines = diffText.split('\n');

  return (
    <div className="psi-diff-viewer">
      {filePath && <div className="psi-diff-file">{filePath}</div>}
      <pre className="psi-diff" aria-label={filePath ? `Diff for ${filePath}` : 'File diff'}>
        {lines.map((line, index) => {
          const kind = line.startsWith('+') && !line.startsWith('+++')
            ? 'added'
            : line.startsWith('-') && !line.startsWith('---')
              ? 'removed'
              : line.startsWith('@@')
                ? 'hunk'
                : '';
          return <span className={kind} key={`${index}-${line}`}>{line || ' '}{'\n'}</span>;
        })}
      </pre>
    </div>
  );
}