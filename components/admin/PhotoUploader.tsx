"use client";

import {
  useCallback,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type DragEvent,
} from "react";

interface PhotoUploaderProps {
  pieceId: string;
  initial: string[];
  onChange: (photos: string[]) => void;
  labels: {
    addPhotos: string;
    hero: string;
    delete: string;
    uploading: string;
    dragHint: string;
    empty: string;
  };
}

interface PendingUpload {
  id: string;
  name: string;
}

export function PhotoUploader({
  pieceId,
  initial,
  onChange,
  labels,
}: PhotoUploaderProps) {
  const [photos, setPhotos] = useState<string[]>(initial);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const dragIndexRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = useCallback(
    (next: string[]) => {
      setPhotos(next);
      onChange(next);
    },
    [onChange],
  );

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);

    const ticketed = files.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      file: f,
    }));

    setPending((prev) => [...prev, ...ticketed.map(({ id, name }) => ({ id, name }))]);

    const uploadOne = async (entry: { id: string; file: File; name: string }) => {
      const fd = new FormData();
      fd.append("piece_id", pieceId);
      fd.append("file", entry.file);
      const res = await fetch("/api/admin/photos", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Upload failed (${res.status})`);
      }
      const data = (await res.json()) as { url: string };
      return data.url;
    };

    const urls: string[] = [];
    for (const entry of ticketed) {
      try {
        const url = await uploadOne(entry);
        urls.push(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setPending((prev) => prev.filter((p) => p.id !== entry.id));
      }
    }

    if (urls.length > 0) {
      startTransition(() => update([...photos, ...urls]));
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const remove = async (url: string) => {
    setError(null);
    const next = photos.filter((p) => p !== url);
    update(next);
    try {
      await fetch("/api/admin/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ piece_id: pieceId, url }),
      });
    } catch {
      // The local state already removed the photo; storage residue is
      // acceptable. Phase 5 can sweep orphans.
    }
  };

  const onDragStart = (i: number) => () => {
    dragIndexRef.current = i;
  };
  const onDragOver = (e: DragEvent<HTMLLIElement>) => {
    e.preventDefault();
  };
  const onDrop = (i: number) => (e: DragEvent<HTMLLIElement>) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    if (from === null || from === i) return;
    const next = photos.slice();
    const [moved] = next.splice(from, 1);
    if (moved !== undefined) {
      next.splice(i, 0, moved);
    }
    update(next);
  };

  return (
    <div data-testid="photo-uploader" className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.2em] text-dark-text-200">
          {labels.dragHint}
        </span>
        <label className="cursor-pointer rounded-sm border border-dark-700 px-4 py-2 text-sm text-dark-text-100 transition hover:border-primary-500 hover:text-primary-400">
          {labels.addPhotos}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
            data-testid="photo-input"
          />
        </label>
      </div>

      {error ? (
        <p
          data-testid="photo-uploader-error"
          className="text-sm text-red-400"
        >
          {error}
        </p>
      ) : null}

      {photos.length === 0 && pending.length === 0 ? (
        <p className="rounded-sm border border-dashed border-dark-700 px-4 py-8 text-center text-sm text-dark-text-200">
          {labels.empty}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {photos.map((url, i) => (
            <li
              key={url}
              draggable
              onDragStart={onDragStart(i)}
              onDragOver={onDragOver}
              onDrop={onDrop(i)}
              className="group relative aspect-square overflow-hidden rounded-sm border border-dark-700 bg-dark-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                className="h-full w-full object-cover"
              />
              {i === 0 ? (
                <span className="absolute left-2 top-2 rounded-sm bg-primary-500/90 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-white">
                  {labels.hero}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => remove(url)}
                className="absolute right-2 top-2 rounded-sm bg-dark-950/80 px-2 py-1 text-xs text-dark-text-100 opacity-0 transition group-hover:opacity-100 hover:bg-accent-500/80 hover:text-white"
                aria-label={labels.delete}
                data-testid="photo-delete"
              >
                {labels.delete}
              </button>
            </li>
          ))}
          {pending.map((p) => (
            <li
              key={p.id}
              className="flex aspect-square items-center justify-center rounded-sm border border-dashed border-dark-700 text-xs text-dark-text-200"
            >
              {labels.uploading}
              <br />
              {p.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
