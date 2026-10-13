/* eslint-disable @next/next/no-img-element -- signed, short-lived storage
   URLs: next/image would need the bucket host configured and would cache a
   URL that expires in an hour. */
import type { JournalReport } from "@/lib/api/reportApi";
import {
  PlacementFields,
  ReportTitle,
  Signature,
  printDateOnly,
} from "./ReportParts";

/**
 * The compiled journal: accepted entries only, oldest first, with their
 * photos. The server sends nothing that has not been accepted.
 */
export default function JournalSheet({ report }: { report: JournalReport }) {
  return (
    <article className="text-black font-sans leading-snug">
      <ReportTitle
        title="Compiled Training Journal"
        generatedAt={report.generatedAt}
      />
      <PlacementFields report={report} />

      {report.entries.length === 0 ? (
        <p className="border border-black px-2 py-4 text-center text-[10pt] mb-6">
          No journal entries have been accepted for this placement yet.
        </p>
      ) : (
        <div className="space-y-4 mb-8">
          {report.entries.map((entry) => (
            <section key={entry.id} className="border border-black">
              <h2 className="border-b border-black px-2 py-1 text-[10pt] font-bold">
                {new Date(entry.entryDate).toLocaleDateString(undefined, {
                  weekday: "long",
                  timeZone: "UTC",
                })}
                , {printDateOnly(entry.entryDate)}
              </h2>
              <div className="px-2 py-1.5 text-[10pt] space-y-2">
                <div>
                  <p className="font-semibold">Activities</p>
                  <p className="whitespace-pre-wrap">{entry.activities}</p>
                </div>
                {entry.learnings?.trim() && (
                  <div>
                    <p className="font-semibold">Learnings</p>
                    <p className="whitespace-pre-wrap">{entry.learnings}</p>
                  </div>
                )}
                {entry.photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {entry.photos.map((photo) =>
                      photo.url ? (
                        <img
                          key={photo.id}
                          src={photo.url}
                          alt={photo.originalName}
                          className="break-inside-avoid h-[45mm] w-full border border-black object-cover"
                        />
                      ) : (
                        <p
                          key={photo.id}
                          className="break-inside-avoid flex h-[45mm] items-center justify-center border border-black px-2 text-center text-[8pt]"
                        >
                          Photo unavailable
                        </p>
                      ),
                    )}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <section className="break-inside-avoid grid grid-cols-2 gap-x-10 pt-6">
        <Signature
          name={report.student.name}
          caption="Signature over printed name of the Trainee"
        />
        <Signature
          name={report.supervisorName}
          caption="Signature over printed name of the Supervisor"
        />
      </section>
    </article>
  );
}
