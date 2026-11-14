"use client";

import { useEffect, useState } from "react";
import { useFileTree } from "@/hooks/use-file-tree";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Folder, File, ChevronRight, ChevronDown, Loader2, HardDrive, AlertCircle } from "lucide-react";

interface FileTreeProps {
  folder: string;
  onSelect: (node: any) => void;
  selectedId?: string;
}

function TreeNode({
  node,
  folder,
  onSelect,
  selectedId,
}: {
  node: any;
  folder: string;
  onSelect: (node: any) => void;
  selectedId?: string;
}) {
  const [expanded, setExpanded] = useState(node.state?.selected || false);
  const isDir = !node.li_attr?.isLeaf;
  const isSelected = node.id === selectedId;

  // Load children when expanded
  const { data: children, isLoading } = useFileTree(
    folder,
    expanded && isDir ? node.id : null
  );

  const handleClick = () => {
    if (isDir) {
      setExpanded(!expanded);
    }
    onSelect(node);
  };

  return (
    <div>
      <button
        className={`flex items-center gap-1 w-full text-left px-2 py-1 text-sm rounded hover:bg-muted transition-colors ${
          isSelected ? "bg-muted font-medium" : ""
        } ${node.state?.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        onClick={handleClick}
        disabled={node.state?.disabled}
      >
        {isDir ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )
        ) : (
          <span className="w-3" />
        )}
        {isDir ? (
          <Folder className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{node.text}</span>
        {node.data?.size && (
          <span className="ml-auto text-xs text-muted-foreground shrink-0">
            {node.data.size}
          </span>
        )}
      </button>
      {expanded && isDir && (
        <div className="ml-4">
          {isLoading && (
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </div>
          )}
          {children &&
            Array.isArray(children) &&
            children
              .filter((c: any) => c.parent !== "#")
              .map((child: any) => (
                <TreeNode
                  key={child.id}
                  node={child}
                  folder={folder}
                  onSelect={onSelect}
                  selectedId={selectedId}
                />
              ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ folder, onSelect, selectedId }: FileTreeProps) {
  const { data: rootNodes, isLoading, error } = useFileTree(folder, "1");

  // The first request returns [rootFolder, ...its children]; the root has parent "#".
  const nodes: any[] = Array.isArray(rootNodes) ? rootNodes : [];
  const root = nodes.find((n) => n.parent === "#" && !n.li_attr?.isLeaf);
  const children = nodes.filter((n) => n !== root);

  // Select the base folder by default so New Folder and Upload work in an empty home.
  useEffect(() => {
    if (root && !selectedId) onSelect(root);
  }, [root, selectedId, onSelect]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive p-4 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error.message}
      </p>
    );
  }

  if (!root) {
    // e.g. "You are not authorized" placeholder node
    return <p className="text-sm text-muted-foreground p-4">{children[0]?.text ?? "Folder not available"}</p>;
  }

  const space = root.li_attr?.space;

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        <button
          className={`flex items-center gap-2 w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors ${
            root.id === selectedId ? "bg-muted font-medium" : ""
          }`}
          onClick={() => onSelect(root)}
        >
          <HardDrive className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-medium">{root.text}</span>
          {space && (
            <span className="ml-auto text-xs text-muted-foreground shrink-0">
              {space.free} GB free
            </span>
          )}
        </button>
        <div className="ml-4">
          {children.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">Empty folder</p>
          ) : (
            children.map((node: any) => (
              <TreeNode
                key={node.id}
                node={node}
                folder={folder}
                onSelect={onSelect}
                selectedId={selectedId}
              />
            ))
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
