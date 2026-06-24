"use client";

import { useState } from "react";

interface ReminderNotesCellProps {
  body: string | null;
  error: string | null;
  status?: string | null;
}

export function ReminderNotesCell({ body, error, status }: ReminderNotesCellProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const isFailedOrSkipped = status === "failed" || status === "skipped";
  const errorMessage = error || null;
  const bodyContent = body || null;
  
  // If no content at all, show dash
  if (!errorMessage && !bodyContent) {
    return <span className="text-sm text-slate-400">—</span>;
  }

  // For failed status, show error prominently, then body preview
  if (status === "failed" && errorMessage) {
    // Clean error message (remove stack traces, keep only human-readable part)
    const cleanError = errorMessage.split('\n')[0].trim();
    const truncatedError = cleanError.length > 120 ? cleanError.substring(0, 120) + "..." : cleanError;
    const errorNeedsTruncation = cleanError.length > 120;
    const bodyNeedsTruncation = bodyContent && bodyContent.length > 120;
    const needsExpansion = errorNeedsTruncation || bodyNeedsTruncation;
    
    return (
      <div className="max-w-md">
        {/* Error message prominently displayed */}
        <div className="text-sm font-medium text-red-700 mb-1.5">
          {isExpanded ? cleanError : truncatedError}
        </div>
        
        {/* Body content (show preview if collapsed, full if expanded) */}
        {bodyContent && (
          <div className="text-sm text-slate-600 mt-1.5">
            {isExpanded || !bodyNeedsTruncation ? (
              <div className="whitespace-pre-wrap">{bodyContent}</div>
            ) : (
              <div className="line-clamp-2">{bodyContent}</div>
            )}
          </div>
        )}
        
        {/* Expand/Collapse button */}
        {needsExpansion && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-1.5 text-xs text-blue-600 hover:text-blue-700 hover:underline"
          >
            {isExpanded ? "Collapse" : "View"}
          </button>
        )}
      </div>
    );
  }

  // For skipped status, show error prominently, then body preview
  if (status === "skipped" && errorMessage) {
    const cleanError = errorMessage.split('\n')[0].trim();
    const truncatedError = cleanError.length > 120 ? cleanError.substring(0, 120) + "..." : cleanError;
    const errorNeedsTruncation = cleanError.length > 120;
    const bodyNeedsTruncation = bodyContent && bodyContent.length > 120;
    const needsExpansion = errorNeedsTruncation || bodyNeedsTruncation;
    
    return (
      <div className="max-w-md">
        {/* Error message prominently displayed */}
        <div className="text-sm font-medium text-amber-700 mb-1.5">
          {isExpanded ? cleanError : truncatedError}
        </div>
        
        {/* Body content (show preview if collapsed, full if expanded) */}
        {bodyContent && (
          <div className="text-sm text-slate-600 mt-1.5">
            {isExpanded || !bodyNeedsTruncation ? (
              <div className="whitespace-pre-wrap">{bodyContent}</div>
            ) : (
              <div className="line-clamp-2">{bodyContent}</div>
            )}
          </div>
        )}
        
        {/* Expand/Collapse button */}
        {needsExpansion && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-1.5 text-xs text-blue-600 hover:text-blue-700 hover:underline"
          >
            {isExpanded ? "Collapse" : "View"}
          </button>
        )}
      </div>
    );
  }

  // For sent status or when no error, show body content normally
  const content = bodyContent || errorMessage || null;
  if (!content) {
    return <span className="text-sm text-slate-400">—</span>;
  }

  const needsTruncation = content.length > 120;

  return (
    <div className="max-w-md">
      <div className="text-sm text-slate-600">
        {isExpanded || !needsTruncation ? (
          <div className="whitespace-pre-wrap">{content}</div>
        ) : (
          <div className="line-clamp-2">{content}</div>
        )}
      </div>
      {needsTruncation && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
        >
          {isExpanded ? "Collapse" : "View"}
        </button>
      )}
    </div>
  );
}

