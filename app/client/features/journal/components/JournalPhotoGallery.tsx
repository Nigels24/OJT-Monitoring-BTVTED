import { FileWarning } from "lucide-react";
import type { JournalPhoto } from "@/lib/api/journalApi";

interface JournalPhotoGalleryProps {
  photos: JournalPhoto[];
  emptyMessage?: string;
}

/**
 * The photographs attached to one entry.
 *
 * Each `url` is a short-lived signed URL minted for this request — the bucket is
 * private, so these links stop working shortly after the page is loaded, and
 * `null` means the stored object has gone missing (that one tile degrades
 * instead of the whole entry failing, the same rule `FileLink` follows).
 *
 * Plain `<img>` rather than `next/image`: the host is a signed Supabase URL that
 * changes every request, so it can neither be configured as a remote pattern nor
 * usefully optimised or cached.
 */
export default function JournalPhotoGallery({
  photos,
  emptyMessage = "No photos were attached to this entry.",
}: JournalPhotoGalleryProps) {
  if (photos.length === 0) {
    return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  }

  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {[...photos]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((photo) => (
          <li
            key={photo.id}
            className="rounded-lg border border-gray-200 overflow-hidden"
          >
            {photo.url ? (
              <a href={photo.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.caption ?? photo.originalName}
                  className="w-full h-32 object-cover hover:opacity-90"
                />
              </a>
            ) : (
              <div className="w-full h-32 flex flex-col items-center justify-center gap-1 bg-amber-50 text-amber-700 text-xs px-2 text-center">
                <FileWarning size={16} />
                Stored file unavailable
              </div>
            )}
            <p className="px-2 py-1.5 text-[11px] text-gray-500 truncate">
              {photo.caption ?? photo.originalName}
            </p>
          </li>
        ))}
    </ul>
  );
}
