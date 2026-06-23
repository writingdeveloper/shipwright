import { isStorageConfigured } from "@repo/storage";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

import { DeleteFileButton } from "./delete-file-button";
import { listFiles } from "./file-actions";
import { FileUpload } from "./file-upload";

/** Human-readable byte size for the file list (e.g. "2.5 MB", "812 B"). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * Files card (RSC). Owner-scoped file list via listFiles (returns [] when
 * storage isn't configured, so the keyless app renders a stable
 * "Storage not configured" note).
 */
export async function FilesCard() {
  const storageConfigured = isStorageConfigured();
  const files = await listFiles();

  return (
    <Card data-testid="files-card">
      <CardHeader>
        <CardTitle asChild>
          <h2 id="files-heading" tabIndex={-1}>
            Files
          </h2>
        </CardTitle>
        {/* Live region: announces the new count after an upload / delete
            (the RSC card re-renders on revalidation). */}
        <CardDescription role="status" aria-live="polite">
          {!storageConfigured
            ? "Storage not configured."
            : files.length === 0
              ? "No files yet."
              : `${files.length} file${files.length === 1 ? "" : "s"}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!storageConfigured ? (
          <p
            data-testid="storage-not-configured"
            className="text-muted-foreground text-sm"
          >
            Set S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
            and S3_BUCKET to enable file uploads.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <FileUpload />
            {files.length === 0 ? (
              <div className="border-border text-muted-foreground flex flex-col items-center gap-1 rounded-lg border border-dashed px-6 py-10 text-center text-sm">
                <p className="text-foreground font-medium">No files yet</p>
                <p>Upload your first file using the button above.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {files.map((f) => (
                  <li
                    key={f.id}
                    className="hover:bg-accent/50 flex items-center gap-3 rounded-md px-2 py-2 transition-colors"
                  >
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={f.name}
                      className="flex-1 truncate text-sm underline-offset-4 hover:underline"
                    >
                      {f.name}
                    </a>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatBytes(f.size)}
                    </span>
                    <DeleteFileButton id={f.id} name={f.name} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
