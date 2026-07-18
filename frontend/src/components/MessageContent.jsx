import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { useTheme } from '../context/ThemeContext';
import { Globe } from './icons';

// Simple Citation Badge Component
const CitationBadge = ({ citation, label, onClick }) => {
  const titleText = citation
    ? `Doc: ${citation.doc_filename || citation.document_name || 'Source'} (Page ${citation.page_number || 1})`
    : 'Unknown Document Source';

  return (
    <span
      className="citation-badge"
      title={titleText}
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick();
      }}
    >
      {label || 'Source'}
    </span>
  );
};

// Interactive Code Block Component with Copy Action
const CodeBlock = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#0d0d0d] shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-[#151515] text-xs font-mono text-gray-500 dark:text-gray-400">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors border border-gray-200 dark:border-gray-700"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto font-mono leading-relaxed text-gray-800 dark:text-gray-200 m-0" style={{ fontSize: '0.875em' }}>
        <code className={language ? `language-${language}` : ''}>
          {code}
        </code>
      </pre>
    </div>
  );
};

export const MessageContent = ({ content, citations, onCitationClick }) => {
  const { theme } = useTheme();
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (!content) return null;

  // Pre-process content to transform inline citations to specialized URLs for react-markdown rendering
  const preprocessContent = (text) => {
    let processed = text;

    // 1. Convert [cite:doc_id] -> [Source](http://cite/doc_id)
    processed = processed.replace(/\[cite:([^\]]+)\]/g, (_, docId) => {
      return `[Source](http://cite/${docId})`;
    });

    // 2. Convert [Page N] -> [📄 Page N](http://page/N)
    processed = processed.replace(/\[(?:Page|page|p\.)\s*(\d+(?:\s*,\s*\d+)*)\]/g, (_, pageNum) => {
      return `[📄 Page ${pageNum}](http://page/${pageNum})`;
    });

    // 3. Convert [Web N: Title](url) -> [🌐 Web N](http://web/url?href=...)
    processed = processed.replace(/\[Web\s*(\d+)(?::\s*([^\]]+))?\]\((https?:\/\/[^)]+)\)/g, (_, webNum, title, url) => {
      const cleanTitle = title || `Source ${webNum}`;
      return `[🌐 Web ${webNum}](http://web/url?href=${encodeURIComponent(url)}&title=${encodeURIComponent(cleanTitle)})`;
    });

    return processed;
  };

  const cleanContent = preprocessContent(content);

  // Custom Sanitization Schema to strictly disable all raw HTML rendering
  const customSanitizeSchema = {
    ...defaultSchema,
    attributes: {
      ...defaultSchema.attributes,
      a: [...(defaultSchema.attributes?.a || []), 'href', 'title', 'target', 'rel']
    },
    protocols: {
      href: ['http', 'https', 'mailto', 'tel', 'cite', 'page', 'web']
    }
  };

  // Custom components for mapping Markdown to styled theme-aware elements
  const components = {
    p: ({ children }) => (
      <p className="mb-4 text-gray-800 dark:text-gray-200 last:mb-0">
        {children}
      </p>
    ),
    h1: ({ children }) => (
      <h1 className="font-bold mt-6 mb-3 text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-800 pb-1.5" style={{ fontSize: '1.625em', lineHeight: '1.25' }}>
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="font-semibold mt-5 mb-2.5 text-gray-900 dark:text-white" style={{ fontSize: '1.375em', lineHeight: '1.3' }}>
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="font-medium mt-4 mb-2 text-gray-900 dark:text-white" style={{ fontSize: '1.1875em', lineHeight: '1.4' }}>
        {children}
      </h3>
    ),
    ul: ({ children }) => (
      <ul className="list-disc pl-6 mb-4 text-gray-800 dark:text-gray-200 space-y-1.5">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal pl-6 mb-4 text-gray-800 dark:text-gray-200 space-y-1.5">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="pl-0.5">
        {children}
      </li>
    ),
    blockquote: ({ children }) => (
      <blockquote className="pl-4 border-l-4 border-gray-300 dark:border-gray-700 italic my-4 text-gray-600 dark:text-gray-400" style={{ fontSize: '0.9375em' }}>
        {children}
      </blockquote>
    ),
    code: ({ node, inline, className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      const codeString = String(children).replace(/\n$/, '');
      const isInline = !codeString.includes('\n') && !className;

      if (isInline) {
        return (
          <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800/80 text-rose-600 dark:text-rose-400 font-mono rounded border border-gray-200 dark:border-gray-700/80" style={{ fontSize: '0.875em' }} {...props}>
            {children}
          </code>
        );
      }

      return (
        <CodeBlock language={language} code={codeString} />
      );
    },
    table: ({ children }) => (
      <div className="overflow-x-auto my-4 border border-gray-200 dark:border-gray-850 rounded-lg">
        <table className="min-w-full divide-y divide-gray-250 dark:divide-gray-850">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-gray-50 dark:bg-gray-905/50">
        {children}
      </thead>
    ),
    th: ({ children }) => (
      <th className="px-4 py-2.5 text-left font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800" style={{ fontSize: '0.75em' }}>
        {children}
      </th>
    ),
    tbody: ({ children }) => (
      <tbody className="bg-white dark:bg-transparent divide-y divide-gray-200 dark:divide-gray-800">
        {children}
      </tbody>
    ),
    td: ({ children }) => (
      <td className="px-4 py-2.5 text-gray-850 dark:text-gray-200 border-b border-gray-100 dark:border-gray-900" style={{ fontSize: '0.9375em' }}>
        {children}
      </td>
    ),
    a: ({ href, children, ...props }) => {
      // 1. Intercept structured UUID citation link
      if (href?.startsWith('cite://') || href?.startsWith('http://cite/')) {
        const docId = href.startsWith('cite://') 
          ? href.replace('cite://', '') 
          : href.replace('http://cite/', '');
        const citation = citations?.find(c => c.document_id === docId) || citations?.[0] || {
          document_id: docId,
          doc_filename: 'Source Document',
          page_number: 1,
          excerpt: 'No detailed excerpt is available for this citation.'
        };
        return (
          <CitationBadge
            citation={citation}
            label={children}
            onClick={() => onCitationClick && onCitationClick(citation)}
          />
        );
      }

      // 2. Intercept legacy page citation link
      if (href?.startsWith('page://') || href?.startsWith('http://page/')) {
        const pageNum = href.startsWith('page://')
          ? href.replace('page://', '')
          : href.replace('http://page/', '');
        const pageCit = citations?.find(c => String(c.page_number) === pageNum) || citations?.[0] || {
          doc_filename: 'Source Document',
          page_number: parseInt(pageNum) || 1,
          excerpt: 'No detailed excerpt is available for this citation.'
        };
        return (
          <CitationBadge
            citation={pageCit}
            label={`📄 Page ${pageNum}`}
            onClick={() => onCitationClick && onCitationClick(pageCit)}
          />
        );
      }

      // 3. Intercept legacy web citation link
      if (href?.startsWith('web://url') || href?.startsWith('http://web/url')) {
        try {
          const queryPart = href.includes('?') ? href.split('?')[1] : '';
          const urlParams = new URLSearchParams(queryPart);
          const realUrl = urlParams.get('href');
          const title = urlParams.get('title') || 'Web Source';
          return (
            <a
              href={realUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="citation-badge citation-badge-web inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors mx-1"
              title={`${title} (${realUrl})`}
              onClick={(e) => e.stopPropagation()}
            >
              <Globe className="w-3 h-3 inline-block" /> {children}
            </a>
          );
        } catch (e) {
          console.error('Failed to parse web citation URL:', e);
        }
      }

      // Standard external links
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline transition-colors"
          {...props}
        >
          {children}
        </a>
      );
    }
  };

  return (
    <div className={`prose max-w-none ${isDark ? 'prose-invert' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight, [rehypeSanitize, customSanitizeSchema]]}
        components={components}
      >
        {cleanContent}
      </ReactMarkdown>
    </div>
  );
};

export default MessageContent;
