"use client";

import { use, useState } from "react";
import { FileTree } from "@/components/storage/file-tree";
import { FileViewer } from "@/components/storage/file-viewer";
import { UploadButton } from "@/components/storage/upload-button";
import { useFileOperation } from "@/hooks/use-file-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FolderPlus, FolderOpen, Trash2, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";

export default function StoragePage({
  params,
}: {
  params: Promise<{ folder: string }>;
}) {
  const { folder } = use(params);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const fileOp = useFileOperation();

  const selectedFile = selectedNode?.li_attr?.isLeaf ? selectedNode.id : null;
  const selectedDir = selectedNode && !selectedNode.li_attr?.isLeaf ? selectedNode.id : null;
  // Upload into the selected folder, or next to the selected file.
  const uploadDir = selectedDir ?? (selectedFile && selectedNode.parent !== "#" ? selectedNode.parent : null);
  const targetName = selectedDir ? selectedNode.text : uploadDir ? uploadDir.replace(/\/$/, "").split("/").pop() : "";

  const handleCreateFolder = () => {
    if (!newFolderName || !uploadDir) return;
    fileOp.mutate(
      { action: "mkdir", directory: uploadDir, name: newFolderName },
      {
        onSuccess: () => {
          toast.success("Folder created");
          setNewFolderName("");
          setDialogOpen(false);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleDelete = () => {
    if (!selectedNode) return;
    const target = selectedNode.id;
    if (!confirm(`Delete ${selectedNode.text}?`)) return;
    fileOp.mutate(
      { action: "delete", file: target, force: true },
      {
        onSuccess: () => {
          toast.success("Deleted");
          setSelectedNode(null);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <PageHeader
        icon={FolderOpen}
        title={folder === "working" ? "Working directory" : "My files"}
        description="Everything here runs as your own cluster account."
        actions={
        <>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!uploadDir}>
                <FolderPlus className="mr-2 h-4 w-4" /> New Folder
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New folder in {targetName}</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => { e.preventDefault(); handleCreateFolder(); }}
              >
                <Input
                  autoFocus
                  aria-label="Folder name"
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                />
                <Button type="submit" disabled={!newFolderName || fileOp.isPending}>
                  Create
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <UploadButton destination={uploadDir} />

          {selectedFile && (
            <a href={`/api/data/download?file=${encodeURIComponent(selectedFile)}`}>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" /> Download
              </Button>
            </a>
          )}

          {selectedNode && !selectedNode.li_attr?.root && (
            <Button variant="outline" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          )}
        </>
        }
      />

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 min-h-0">
        <div className="border rounded-md overflow-hidden">
          <FileTree
            folder={folder}
            onSelect={setSelectedNode}
            selectedId={selectedNode?.id}
          />
        </div>
        <div className="min-h-0">
          <FileViewer resource={selectedFile} />
        </div>
      </div>
    </div>
  );
}
