"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Uppy from "@uppy/core";
import Tus from "@uppy/tus";
import DashboardModal from "@uppy/react/dashboard-modal";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tusOptions } from "@/lib/client/upload";
import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";

interface UploadButtonProps {
  /** Absolute folder the files go to. */
  destination: string | null;
}

export function UploadButton({ destination }: UploadButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [uppy] = useState(() =>
    new Uppy({ autoProceed: false }).use(Tus, {
      ...tusOptions,
      allowedMetaFields: ["name", "type", "destination"],
    })
  );

  useEffect(() => {
    uppy.setMeta({ destination: destination ?? "" });
  }, [uppy, destination]);

  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["file-tree"] });
    uppy.on("complete", refresh);
    return () => {
      uppy.off("complete", refresh);
    };
  }, [uppy, queryClient]);

  return (
    <>
      <Button variant="outline" size="sm" disabled={!destination} onClick={() => setOpen(true)}>
        <Upload className="mr-2 h-4 w-4" /> Upload
      </Button>
      <DashboardModal
        uppy={uppy}
        open={open}
        onRequestClose={() => setOpen(false)}
        closeModalOnClickOutside
        proudlyDisplayPoweredByUppy={false}
        note={destination ? `Uploading to ${destination}` : undefined}
      />
    </>
  );
}
