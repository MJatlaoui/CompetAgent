"use client";

import { useState } from "react";
import { Eye, Link, X, Tag } from "lucide-react";

interface WorkflowToolbarProps {
  insightId: string;
  tags: string[];
  onStatusChange?: (id: string, status: string) => void;
  onTagsChange?: (id: string, tags: string[]) => void;
}

export function WorkflowToolbar({
  insightId,
  tags,
  onStatusChange,
  onTagsChange,
}: WorkflowToolbarProps) {
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    const next = [...tags, trimmed];
    onTagsChange?.(insightId, next);
    setTagInput("");
  }

  function removeTag(tag: string) {
    onTagsChange?.(insightId, tags.filter((t) => t !== tag));
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onStatusChange?.(insightId, "seen")}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition"
          title="Mark as already seen"
        >
          <Eye className="w-3 h-3" />
          Already Seen
        </button>
        <button
          onClick={() => setTagPickerOpen((v) => !v)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition"
          title="Link tags"
        >
          <Link className="w-3 h-3" />
          Link Subject
        </button>
      </div>

      {tagPickerOpen && (
        <div className="absolute top-full mt-1 left-0 z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-72">
          <div className="flex items-center gap-1 mb-2">
            <Tag className="w-3 h-3 text-gray-400" />
            <span className="text-xs font-semibold text-gray-600">Tags</span>
            <button
              onClick={() => setTagPickerOpen(false)}
              className="ml-auto text-gray-400 hover:text-gray-600"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full cursor-pointer hover:bg-blue-200"
                onClick={() => removeTag(tag)}
              >
                {tag} <X className="w-2.5 h-2.5" />
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTag(tagInput);
              }}
              placeholder="Add tag..."
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={() => addTag(tagInput)}
              className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
