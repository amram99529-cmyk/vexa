"use client";

import {
  useRef,
  useState,
} from "react";

type UploadBoxProps = {
  onImageSelect?: (
    file: File,
    preview: string
  ) => void;
};


async function removeWhiteBackground(
  file: File
): Promise<File> {

  const bitmap =
    await createImageBitmap(file);

  const maxSize = 1200;

  let width = bitmap.width;
  let height = bitmap.height;

  if (
    Math.max(
      width,
      height
    ) > maxSize
  ) {

    const scale =
      maxSize /
      Math.max(
        width,
        height
      );

    width =
      Math.round(
        width * scale
      );

    height =
      Math.round(
        height * scale
      );
  }

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width = width;
  canvas.height = height;

  const ctx =
    canvas.getContext(
      "2d",
      {
        willReadFrequently: true
      }
    );

  if (!ctx) {
    throw new Error(
      "Canvas is not supported"
    );
  }

  ctx.drawImage(
    bitmap,
    0,
    0,
    width,
    height
  );

  const imageData =
    ctx.getImageData(
      0,
      0,
      width,
      height
    );

  const data =
    imageData.data;

  const visited =
    new Uint8Array(
      width * height
    );

  const queueX =
    new Int32Array(
      width * height
    );

  const queueY =
    new Int32Array(
      width * height
    );

  let head = 0;
  let tail = 0;

  function nearWhite(
    pixel: number
  ) {

    const r = data[pixel];
    const g = data[pixel + 1];
    const b = data[pixel + 2];

    const distance = Math.sqrt(
      Math.pow(255 - r, 2) +
      Math.pow(255 - g, 2) +
      Math.pow(255 - b, 2)
    );

    return distance < 95;
  }


  function add(
    x: number,
    y: number
  ) {

    if (
      x < 0 ||
      x >= width ||
      y < 0 ||
      y >= height
    ) {
      return;
    }

    const index =
      y * width + x;

    if (
      visited[index]
    ) {
      return;
    }

    const pixel =
      index * 4;

    if (
      !nearWhite(pixel)
    ) {
      return;
    }

    visited[index] = 1;

    queueX[tail] = x;
    queueY[tail] = y;

    tail++;
  }


  for (
    let x = 0;
    x < width;
    x++
  ) {

    add(x, 0);

    add(
      x,
      height - 1
    );
  }


  for (
    let y = 0;
    y < height;
    y++
  ) {

    add(0, y);

    add(
      width - 1,
      y
    );
  }


  while (
    head < tail
  ) {

    const x =
      queueX[head];

    const y =
      queueY[head];

    head++;

    const pixel =
      (y * width + x) * 4;

    data[pixel + 3] = 0;

    add(x + 1, y);
    add(x - 1, y);
    add(x, y + 1);
    add(x, y - 1);

    add(x + 1, y + 1);
    add(x - 1, y - 1);
    add(x + 1, y - 1);
    add(x - 1, y + 1);
  }


  ctx.putImageData(
    imageData,
    0,
    0
  );


  const blob =
    await new Promise<Blob>(
      (resolve, reject) => {

        canvas.toBlob(
          (result) => {

            if (result) {
              resolve(result);
            } else {
              reject(
                new Error(
                  "Failed to create PNG"
                )
              );
            }

          },
          "image/png"
        );

      }
    );


  return new File(
    [
      blob
    ],
    file.name.replace(
      /\.[^/.]+$/,
      ""
    ) + ".png",
    {
      type: "image/png"
    }
  );
}


export default function UploadBox({
  onImageSelect,
}: UploadBoxProps) {

  const inputRef =
    useRef<HTMLInputElement>(
      null
    );

  const [
    preview,
    setPreview
  ] = useState<string | null>(
    null
  );

  const [
    fileName,
    setFileName
  ] = useState("");

  const [
    processing,
    setProcessing
  ] = useState(false);


  const handleFile =
    async (
      file: File
    ) => {

      if (
        !file.type.startsWith(
          "image/"
        )
      ) {

        alert(
          "Please select an image file."
        );

        return;
      }

      if (
        file.size >
        10 * 1024 * 1024
      ) {

        alert(
          "Image size must be less than 10MB."
        );

        return;
      }


      try {

        setProcessing(true);

        const processed =
          await removeWhiteBackground(
            file
          );

        const previewUrl =
          URL.createObjectURL(
            processed
          );

        setPreview(
          previewUrl
        );

        setFileName(
          file.name
        );

        onImageSelect?.(
          processed,
          previewUrl
        );

      } catch (error) {

        console.error(
          error
        );

        alert(
          "Background removal failed."
        );

      } finally {

        setProcessing(false);
      }
    };


  const handleInputChange =
    (
      event:
        React.ChangeEvent<HTMLInputElement>
    ) => {

      const file =
        event.target.files?.[0];

      if (file) {
        handleFile(file);
      }
    };


  const handleDrop =
    (
      event:
        React.DragEvent<HTMLDivElement>
    ) => {

      event.preventDefault();

      const file =
        event.dataTransfer
          .files?.[0];

      if (file) {
        handleFile(file);
      }
    };


  return (

    <div
      onClick={() =>
        inputRef.current?.click()
      }

      onDragOver={(event) =>
        event.preventDefault()
      }

      onDrop={handleDrop}

      className="mx-auto w-full cursor-pointer rounded-3xl border-2 border-dashed border-zinc-700 bg-zinc-900 p-8 text-center transition-all hover:border-cyan-500 hover:bg-zinc-800"
    >

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        onChange={
          handleInputChange
        }
        className="hidden"
      />


      {processing ? (

        <div className="flex min-h-64 flex-col items-center justify-center">

          <div className="mb-5 h-10 w-10 animate-spin rounded-full border-4 border-zinc-700 border-t-cyan-400" />

          <p className="font-semibold text-white">
            Removing background...
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            Preparing image for VEXA
          </p>

        </div>

      ) : preview ? (

        <div className="flex w-full flex-col items-center gap-4">

          <div className="flex h-64 w-full items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(45deg,#181818_25%,transparent_25%),linear-gradient(-45deg,#181818_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#181818_75%),linear-gradient(-45deg,transparent_75%,#181818_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0px]">

            <img
              src={preview}
              alt="Processed uploaded object"
              className="h-full w-full object-contain"
            />

          </div>


          <div className="text-center">

            <p className="font-semibold text-white">
              {fileName}
            </p>

            <p className="mt-1 text-sm text-emerald-400">
              ✓ Background removed
            </p>

            <p className="mt-1 text-sm text-zinc-500">
              Click or drop another image
            </p>

          </div>

        </div>

      ) : (

        <div className="flex flex-col items-center">

          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 text-3xl text-white">
            ↑
          </div>

          <h3 className="text-xl font-bold text-white">
            Upload Your Image
          </h3>

          <p className="mt-2 text-zinc-400">
            Drag & Drop Your Image
          </p>

          <p className="mt-1 text-sm text-zinc-500">
            or click to browse
          </p>

          <p className="mt-4 text-xs text-zinc-600">
            PNG, JPG, JPEG or WEBP • Maximum 10MB
          </p>

        </div>

      )}

    </div>
  );
}