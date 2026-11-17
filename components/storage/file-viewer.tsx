"use client";

import { useState } from "react";
import { useFileContent, useSaveFile } from "@/hooks/use-file-tree";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Save, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";

interface FileViewerProps {
  resource: string | null;
}

export function FileViewer({ resource }: FileViewerProps) {
  const { data, isLoading, error } = useFileContent(resource);
  const [editContent, setEditContent] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const saveFile = useSaveFile();

  if (!resource) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2" />
            <p>Select a file to view</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full">
        <CardContent className="pt-6">
          <p className="text-destructive text-sm">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const content = editContent ?? data?.content ?? "";
  const fileName = resource.split("/").pop() || resource;

  const handleSave = () => {
    if (!resource || editContent === null) return;
    saveFile.mutate(
      { resource, content: editContent },
      {
        onSuccess: () => {
          toast.success("File saved");
          setIsEditing(false);
          setEditContent(null);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium truncate">{fileName}</CardTitle>
        <div className="flex gap-2">
          {!isEditing ? (
            <Button variant="outline" size="sm" onClick={() => { setIsEditing(true); setEditContent(content); }}>
              Edit
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => { setIsEditing(false); setEditContent(null); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saveFile.isPending}>
                {saveFile.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                Save
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        {isEditing ? (
          <textarea
            className="w-full h-full min-h-[400px] rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-none"
            value={editContent || ""}
            onChange={(e) => setEditContent(e.target.value)}
          />
        ) : (
          <ScrollArea className="h-[400px]">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted p-4 rounded-md">
              {content || "Empty file"}
            </pre>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
