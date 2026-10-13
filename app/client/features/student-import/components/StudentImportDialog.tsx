import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  Download,
  FileSpreadsheet,
  Mail,
  Upload,
} from "lucide-react";
import FormDialog from "@/components/ui/FormDialog";
import SelectField from "@/components/ui/SelectField";
import Button from "@/components/ui/Button";
import { MAX_IMPORT_ROWS } from "@/lib/api/studentApi";
import { ImportFilter, useStudentImport } from "../hooks/use-student-import";

interface StudentImportDialogProps {
  open: boolean;
  onClose: () => void;
}

const FILTERS: { key: ImportFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "valid", label: "Valid" },
  { key: "errors", label: "Errors" },
];

/**
 * Batch enrollment from the Excel template, in three screens: upload, preview,
 * result. The server decides everything — which rows are valid, what was
 * created, whether logins were emailed — and this shows it.
 */
export default function StudentImportDialog({
  open,
  onClose,
}: StudentImportDialogProps) {
  const imp = useStudentImport(open, onClose);
  const { preview, result } = imp;

  return (
    <FormDialog
      open={open}
      title="Import Students from Excel"
      subtitle={
        imp.step === "upload"
          ? "Step 1 of 3 — template and file"
          : imp.step === "preview"
            ? "Step 2 of 3 — check the preview"
            : "Step 3 of 3 — result"
      }
      icon={FileSpreadsheet}
      onClose={imp.close}
    >
      {imp.step === "upload" && (
        <div className="space-y-5">
          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">
              1. Download the template
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              One row per student, up to {MAX_IMPORT_ROWS}. The Course and Year
              Level dropdowns are filled from the system, so download a fresh
              copy if courses have changed. Establishments are assigned later,
              when a placement is recorded.
            </p>
            <button
              type="button"
              onClick={() => {
                void imp.downloadTemplate();
              }}
              disabled={imp.isDownloading}
              className="inline-flex items-center gap-2 h-10 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <Download size={16} />
              {imp.isDownloading ? "Preparing..." : "Download template (.xlsx)"}
            </button>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">
              2. Block for all imported students (optional)
            </h3>
            <SelectField
              value={imp.blockId}
              onChange={imp.setBlockId}
              options={[{ label: "None", value: "" }, ...imp.blockOptions]}
            />
            <p className="text-xs text-gray-500 mt-1.5">
              A block belongs to one course and year level, so rows for any
              other course or year will be rejected if you pick one.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">
              3. Upload the filled-in file
            </h3>
            <label
              htmlFor="student-import-file"
              className="sr-only"
            >
              Excel file
            </label>
            <input
              id="student-import-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={imp.handleFileChange}
              className="w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {imp.file && (
              <p className="text-sm text-gray-700 mt-2">
                Selected: <span className="font-medium">{imp.file.name}</span>
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1.5">
              .xlsx only, up to 2MB. Nothing is saved until you confirm on the
              next screen.
            </p>
            {imp.fileError && <ErrorNote>{imp.fileError}</ErrorNote>}
          </section>

          {imp.error && <ErrorNote>{imp.error}</ErrorNote>}

          <div className="sm:w-60">
            <Button
              type="button"
              icon={Upload}
              loading={imp.isPreviewing}
              disabled={!imp.file}
              onClick={() => {
                void imp.handlePreview();
              }}
            >
              Upload and preview
            </Button>
          </div>
        </div>
      )}

      {imp.step === "preview" && preview && (
        <div className="space-y-4">
          <dl className="grid grid-cols-3 gap-2">
            {(
              [
                ["Rows in file", preview.counts.total, "text-gray-900"],
                ["Valid", preview.counts.valid, "text-green-700"],
                ["With errors", preview.counts.errors, "text-red-700"],
              ] as const
            ).map(([label, value, color]) => (
              <div key={label} className="rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                  {label}
                </dt>
                <dd className={`text-xl font-bold tabular-nums ${color}`}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <p className="text-sm text-gray-600">
            Nothing has been saved yet.
            {preview.block
              ? ` Valid students will join ${preview.block.name}.`
              : " No block will be assigned."}{" "}
            Rows with errors are skipped; fix them in the file and import them
            in another upload.
          </p>

          <div
            role="group"
            aria-label="Filter rows"
            className="flex items-center gap-1 border border-gray-200 rounded-lg p-1 w-fit"
          >
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={imp.filter === key}
                onClick={() => {
                  imp.setFilter(key);
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  imp.filter === key
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="border border-gray-200 rounded-lg overflow-auto max-h-[45vh]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 sticky top-0">
                <tr>
                  <th scope="col" className="px-3 py-2">Row</th>
                  <th scope="col" className="px-3 py-2">Student No.</th>
                  <th scope="col" className="px-3 py-2">Name</th>
                  <th scope="col" className="px-3 py-2">Email</th>
                  <th scope="col" className="px-3 py-2">Course / Year</th>
                  <th scope="col" className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {imp.visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-6 text-center text-gray-500"
                    >
                      {preview.counts.total === 0
                        ? "The file has no student rows."
                        : "No rows match this filter."}
                    </td>
                  </tr>
                ) : (
                  imp.visibleRows.map((row) => (
                    <tr key={row.rowNumber} className="align-top">
                      <td className="px-3 py-2 tabular-nums text-gray-500">
                        {row.rowNumber}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-700">
                        {row.values.studentNumber || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-900">
                        {[
                          row.values.lastName,
                          [row.values.firstName, row.values.middleInitial]
                            .filter(Boolean)
                            .join(" "),
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                        <div className="text-xs text-gray-500">
                          {[row.values.sex, row.values.birthdate]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-700 break-all">
                        {row.values.email || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {row.values.course || "—"}
                        {row.values.yearLevel !== null
                          ? ` · Year ${row.values.yearLevel}`
                          : ""}
                      </td>
                      <td className="px-3 py-2">
                        {row.status === "VALID" ? (
                          <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                            <CheckCircle2 size={14} />
                            Valid
                          </span>
                        ) : (
                          <ul className="text-red-700 space-y-0.5">
                            {row.reasons.map((reason) => (
                              <li key={reason} className="flex gap-1">
                                <AlertCircle
                                  size={14}
                                  className="shrink-0 mt-0.5"
                                />
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {imp.error && <ErrorNote>{imp.error}</ErrorNote>}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3">
            <button
              type="button"
              onClick={imp.backToUpload}
              className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Back — choose another file
            </button>
            <div className="sm:w-72">
              <Button
                type="button"
                icon={Upload}
                loading={imp.isImporting}
                disabled={preview.counts.valid === 0}
                onClick={() => {
                  void imp.handleImport();
                }}
              >
                Import {preview.counts.valid} valid student
                {preview.counts.valid === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {imp.step === "result" && result && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <dt className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                Created
              </dt>
              <dd className="text-xl font-bold tabular-nums text-green-700">
                {result.created}
              </dd>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <dt className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                Rejected
              </dt>
              <dd className="text-xl font-bold tabular-nums text-red-700">
                {result.rejected.length}
              </dd>
            </div>
          </dl>

          {result.rejected.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2">
              <p className="text-sm text-gray-700">
                {result.rejected.length} row
                {result.rejected.length === 1 ? " was" : "s were"} not imported.
                Download the list, fix those rows, and upload them again.
              </p>
              <button
                type="button"
                onClick={imp.downloadRejected}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
              >
                <Download size={14} />
                Rejected rows (.csv)
              </button>
            </div>
          )}

          {result.created > 0 && result.emailMode === "QUEUED" && (
            <p className="flex items-start gap-2 text-sm text-blue-900 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
              <Mail size={16} className="shrink-0 mt-0.5" />
              <span>
                Login emails are being sent, about one a second. The{" "}
                <strong>Login email</strong> column on the Students page shows
                each one as it goes out; use <strong>Resend login</strong> for
                any that fail.
              </span>
            </p>
          )}

          {result.credentials && result.credentials.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <strong>Email is not configured</strong>, so these logins were
                not sent. Copy them now and hand them out —{" "}
                <strong>this list will not be shown again.</strong> Each
                student will be asked to set their own password at first
                sign-in.
              </p>
              <div className="border border-gray-200 rounded-lg overflow-auto max-h-[35vh]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 sticky top-0">
                    <tr>
                      <th scope="col" className="px-3 py-2">Student No.</th>
                      <th scope="col" className="px-3 py-2">Name</th>
                      <th scope="col" className="px-3 py-2">Login ID</th>
                      <th scope="col" className="px-3 py-2">
                        Temporary password
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-900">
                    {result.credentials.map((credential) => (
                      <tr key={credential.loginId}>
                        <td className="px-3 py-2 font-mono text-xs">
                          {credential.studentNumber}
                        </td>
                        <td className="px-3 py-2">{credential.name}</td>
                        <td className="px-3 py-2 font-mono text-xs break-all">
                          {credential.loginId}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold">
                          {credential.temporaryPassword}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={() => {
                  void imp.copyCredentials();
                }}
                className="inline-flex items-center gap-2 h-10 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {imp.copied ? <Check size={16} /> : <Copy size={16} />}
                {imp.copied ? "Copied" : "Copy all"}
              </button>
            </div>
          )}

          {result.created === 0 && (
            <p className="text-sm text-gray-600">
              No students were created.
            </p>
          )}

          <div className="sm:w-60">
            <Button type="button" onClick={imp.close}>
              Done
            </Button>
          </div>
        </div>
      )}
    </FormDialog>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-2 text-sm text-red-700 border border-red-200 bg-red-50 rounded-lg px-3 py-2"
    >
      {children}
    </p>
  );
}
