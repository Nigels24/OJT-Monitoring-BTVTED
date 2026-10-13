import { FileWarning } from "lucide-react";
import type { WeeklyTaskPhoto } from "@/lib/api/weeklyTaskApi";

interface TaskPhotosProps {
  photos: WeeklyTaskPhoto[];
}

/**
 * A task's proof photos.
 *
 * Each `url` is a short-lived signed URL minted for this request — the bucket
 * is private — and `null` means the stored object has gone missing, so that
 * tile degrades instead of the whole week failing. Plain `<img>` rather than
 * `next/image` for the reason `JournalPhotoGallery` gives: the signed host
 * changes every request.
 */
export default function TaskPhotos({ photos }: TaskPhotosProps) {
  if (photos.length === 0) return null;

  return (
    <ul className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      {photos.map((photo) => (
        <li
          key={photo.id}
          className="rounded-md border border-gray-200 overflow-hidden"
        >
          {photo.url ? (
            <a
              href={photo.url}
              target="_blank"
              rel="noopener noreferrer"
              title={photo.originalName}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.originalName}
                className="w-full h-20 object-cover hover:opacity-90"
              />
            </a>
          ) : (
            <div className="w-full h-20 flex flex-col items-center justify-center gap-1 bg-amber-50 text-amber-700 text-[10px] px-1 text-center">
              <FileWarning size={14} />
              Unavailable
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
