"use client";

import dynamic from "next/dynamic";
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";

const ModelViewer = dynamic(
  () => import("@/components/ModelViewer"),
  {
    ssr: false,
    loading: () => (
      <div className="viewer-loading">
        <div className="loader"></div>
        <span>Loading 3D viewer...</span>
      </div>
    )
  }
);

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

type Stage = "upload" | "processing" | "result";

async function removeBackground(
  file: File
): Promise<File> {

  const bitmap = await createImageBitmap(file);

  const maxSize = 1100;

  const scale = Math.min(
    1,
    maxSize / Math.max(bitmap.width, bitmap.height)
  );

  const width = Math.max(
    2,
    Math.round(bitmap.width * scale)
  );

  const height = Math.max(
    2,
    Math.round(bitmap.height * scale)
  );

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create image canvas.");
  }

  context.drawImage(
    bitmap,
    0,
    0,
    width,
    height
  );

  const imageData = context.getImageData(
    0,
    0,
    width,
    height
  );

  const pixels = imageData.data;

  const cornerColors = [
    [
      pixels[0],
      pixels[1],
      pixels[2]
    ],
    [
      pixels[(width - 1) * 4],
      pixels[(width - 1) * 4 + 1],
      pixels[(width - 1) * 4 + 2]
    ],
    [
      pixels[
        ((height - 1) * width) * 4
      ],
      pixels[
        ((height - 1) * width) * 4 + 1
      ],
      pixels[
        ((height - 1) * width) * 4 + 2
      ]
    ],
    [
      pixels[
        ((height * width) - 1) * 4
      ],
      pixels[
        ((height * width) - 1) * 4 + 1
      ],
      pixels[
        ((height * width) - 1) * 4 + 2
      ]
    ]
  ];

  const visited = new Uint8Array(
    width * height
  );

  const queue = new Int32Array(
    width * height
  );

  let head = 0;
  let tail = 0;

  const threshold = 62;
  const thresholdSquared =
    threshold * threshold;

  function closeToBackground(
    index: number
  ) {

    const offset = index * 4;

    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];

    for (const color of cornerColors) {

      const dr = r - color[0];
      const dg = g - color[1];
      const db = b - color[2];

      const distance =
        dr * dr +
        dg * dg +
        db * db;

      if (distance <= thresholdSquared) {
        return true;
      }
    }

    return false;
  }

  function addSeed(index: number) {

    if (visited[index]) {
      return;
    }

    if (!closeToBackground(index)) {
      return;
    }

    visited[index] = 1;
    queue[tail++] = index;
  }

  for (let x = 0; x < width; x++) {

    addSeed(x);

    addSeed(
      (height - 1) * width + x
    );
  }

  for (let y = 0; y < height; y++) {

    addSeed(
      y * width
    );

    addSeed(
      y * width + width - 1
    );
  }

  while (head < tail) {

    const index = queue[head++];

    pixels[index * 4 + 3] = 0;

    const x = index % width;

    const y = Math.floor(index / width);

    if (x > 0) {

      const next = index - 1;

      if (
        !visited[next] &&
        closeToBackground(next)
      ) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    if (x < width - 1) {

      const next = index + 1;

      if (
        !visited[next] &&
        closeToBackground(next)
      ) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    if (y > 0) {

      const next = index - width;

      if (
        !visited[next] &&
        closeToBackground(next)
      ) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    if (y < height - 1) {

      const next = index + width;

      if (
        !visited[next] &&
        closeToBackground(next)
      ) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
  }

  context.putImageData(
    imageData,
    0,
    0
  );

  const blob = await new Promise<Blob | null>(
    (resolve) =>
      canvas.toBlob(
        resolve,
        "image/png",
        1
      )
  );

  if (!blob) {
    throw new Error(
      "Could not process the image."
    );
  }

  return new File(
    [blob],
    "vexa-input.png",
    {
      type: "image/png"
    }
  );
}


export default function Home() {

  const [stage, setStage] =
    useState<Stage>("upload");

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [preview, setPreview] =
    useState<string | null>(null);

  const [colorUrl, setColorUrl] =
    useState<string | null>(null);

  const [noColorUrl, setNoColorUrl] =
    useState<string | null>(null);

  const [activeModel, setActiveModel] =
    useState<"color" | "noColor">("color");

  const [progress, setProgress] =
    useState(0);

  const [status, setStatus] =
    useState("Waiting for image");

  const [error, setError] =
    useState<string | null>(null);

  const [dragging, setDragging] =
    useState(false);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  useEffect(() => {

    return () => {

      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };

  }, [preview]);


  async function handleFile(
    file: File
  ) {

    if (!file.type.startsWith("image/")) {

      setError(
        "Please upload a JPG, JPEG or PNG image."
      );

      return;
    }

    setError(null);

    try {

      const processed =
        await removeBackground(file);

      if (preview) {
        URL.revokeObjectURL(preview);
      }

      const previewUrl =
        URL.createObjectURL(processed);

      setSelectedFile(processed);

      setPreview(previewUrl);

      setStage("upload");

      setColorUrl(null);

      setNoColorUrl(null);

    } catch (err) {

      console.error(err);

      setError(
        "Could not process this image."
      );
    }
  }


  function handleInput(
    event: ChangeEvent<HTMLInputElement>
  ) {

    const file =
      event.target.files?.[0];

    if (file) {
      handleFile(file);
    }
  }


  function handleDrop(
    event: DragEvent<HTMLDivElement>
  ) {

    event.preventDefault();

    setDragging(false);

    const file =
      event.dataTransfer.files?.[0];

    if (file) {
      handleFile(file);
    }
  }


  async function generateModel() {

    if (!selectedFile) {

      setError(
        "Please upload an image first."
      );

      return;
    }

    setError(null);

    setStage("processing");

    setProgress(8);

    setStatus(
      "Preparing your image..."
    );

    const timer =
      window.setInterval(() => {

        setProgress((current) =>
          Math.min(
            current + 5,
            88
          )
        );

      }, 350);

    try {

      const formData =
        new FormData();

      formData.append(
        "file",
        selectedFile
      );

      setStatus(
        "Reconstructing 3D geometry..."
      );

      const response =
        await fetch(
          `${API_URL}/generate-3d`,
          {
            method: "POST",
            body: formData
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {

        throw new Error(
          data.error ||
          "3D generation failed."
        );
      }

      setStatus(
        "Applying original image texture..."
      );

      setProgress(96);

      const color =
        `${API_URL}${data.color}?t=${Date.now()}`;

      const noColor =
        `${API_URL}${data.no_color}?t=${Date.now()}`;

      setColorUrl(color);

      setNoColorUrl(noColor);

      setActiveModel("color");

      setProgress(100);

      setStatus(
        "3D model ready"
      );

      window.setTimeout(() => {
        setStage("result");
      }, 350);

    } catch (err) {

      console.error(err);

      const message =
        err instanceof Error
          ? err.message
          : "Unknown VEXA error.";

      setError(message);

      setStage("upload");

    } finally {

      window.clearInterval(timer);
    }
  }


  function resetProject() {

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setSelectedFile(null);
    setPreview(null);
    setColorUrl(null);
    setNoColorUrl(null);
    setError(null);
    setProgress(0);
    setStatus("Waiting for image");
    setStage("upload");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }


  const currentModel =
    activeModel === "color"
      ? colorUrl
      : noColorUrl;


  return (
    <main className="vexa-page">

      <style jsx global>{`

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          background: #05070b;
          color: white;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        body {
          min-height: 100vh;
        }

        button,
        input {
          font: inherit;
        }

        .vexa-page {
          min-height: 100vh;
          background:
            radial-gradient(
              circle at 50% -10%,
              rgba(0, 190, 255, 0.13),
              transparent 35%
            ),
            radial-gradient(
              circle at 90% 50%,
              rgba(60, 90, 255, 0.08),
              transparent 30%
            ),
            #05070b;
        }

        .navbar {
          height: 72px;
          width: 100%;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          background: rgba(5,7,11,0.82);
          backdrop-filter: blur(18px);
          position: sticky;
          top: 0;
          z-index: 20;
        }

        .navbar-inner {
          max-width: 1180px;
          height: 100%;
          margin: auto;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .brand-mark {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            linear-gradient(
              135deg,
              #0ee7ff,
              #315dff
            );
          color: #031018;
          font-size: 16px;
          font-weight: 900;
          box-shadow:
            0 0 25px rgba(0,210,255,0.25);
        }

        .brand-name {
          font-size: 20px;
          letter-spacing: 0.16em;
          font-weight: 800;
        }

        .nav-links {
          display: flex;
          gap: 30px;
          color: #8993a4;
          font-size: 13px;
          letter-spacing: 0.05em;
        }

        .nav-links span {
          transition: 0.2s;
        }

        .nav-links span:hover {
          color: white;
        }

        .engine-pill {
          padding: 9px 14px;
          border: 1px solid rgba(0,220,255,0.22);
          background: rgba(0,180,255,0.06);
          border-radius: 999px;
          color: #73eaff;
          font-size: 11px;
          letter-spacing: 0.12em;
          font-weight: 700;
        }

        .hero {
          max-width: 1000px;
          margin: 0 auto;
          padding: 72px 24px 44px;
          text-align: center;
        }

        .eyebrow {
          color: #55ddff;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          margin-bottom: 18px;
        }

        .hero h1 {
          margin: 0;
          font-size: clamp(42px, 6vw, 72px);
          line-height: 0.98;
          letter-spacing: -0.055em;
          font-weight: 850;
          background:
            linear-gradient(
              180deg,
              #ffffff 0%,
              #b7c0cc 65%,
              #6f7885 100%
            );
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .hero p {
          max-width: 650px;
          margin: 24px auto 0;
          color: #7f8998;
          line-height: 1.7;
          font-size: 15px;
        }

        .workspace {
          width: min(1080px, calc(100% - 32px));
          margin: 0 auto 80px;
        }

        .workspace-card {
          border: 1px solid rgba(255,255,255,0.08);
          background:
            linear-gradient(
              180deg,
              rgba(18,23,31,0.96),
              rgba(8,11,16,0.96)
            );
          border-radius: 28px;
          box-shadow:
            0 35px 100px rgba(0,0,0,0.45);
          overflow: hidden;
        }

        .steps {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }

        .step {
          padding: 20px 24px;
          display: flex;
          gap: 13px;
          align-items: center;
          border-right: 1px solid rgba(255,255,255,0.06);
        }

        .step:last-child {
          border-right: 0;
        }

        .step-number {
          width: 31px;
          height: 31px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #121923;
          border: 1px solid #263241;
          color: #718093;
          font-size: 11px;
          font-weight: 800;
        }

        .step.active .step-number {
          color: #031017;
          border-color: #3fe5ff;
          background: #4ee8ff;
          box-shadow:
            0 0 18px rgba(50,225,255,0.25);
        }

        .step-text small {
          display: block;
          color: #657181;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 3px;
        }

        .step-text strong {
          font-size: 13px;
          color: #dbe2ea;
        }

        .content {
          padding: 34px;
        }

        .upload-grid {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 24px;
        }

        .section-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }

        .section-label h2 {
          margin: 0;
          font-size: 16px;
          letter-spacing: -0.02em;
        }

        .section-label span {
          color: #566272;
          font-size: 11px;
        }

        .drop-zone {
          min-height: 390px;
          border: 1px dashed #33404e;
          border-radius: 20px;
          background:
            radial-gradient(
              circle at center,
              rgba(0,200,255,0.045),
              transparent 50%
            ),
            #090d13;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: 0.25s;
          overflow: hidden;
          position: relative;
        }

        .drop-zone:hover,
        .drop-zone.dragging {
          border-color: #28dfff;
          background:
            radial-gradient(
              circle at center,
              rgba(0,200,255,0.10),
              transparent 55%
            ),
            #090d13;
        }

        .drop-content {
          width: 100%;
          text-align: center;
          padding: 30px;
        }

        .upload-icon {
          width: 62px;
          height: 62px;
          margin: 0 auto 20px;
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(46,219,255,0.08);
          border: 1px solid rgba(46,219,255,0.2);
          color: #4be6ff;
          font-size: 27px;
        }

        .drop-content h3 {
          margin: 0 0 8px;
          font-size: 18px;
        }

        .drop-content p {
          color: #657181;
          margin: 0 0 22px;
          font-size: 13px;
        }

        .browse-button {
          border: 1px solid #283442;
          background: #111720;
          color: #d9e0e8;
          padding: 11px 18px;
          border-radius: 10px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
        }

        .browse-button:hover {
          border-color: #3ddffb;
          color: white;
        }

        .preview-box {
          width: 100%;
          height: 100%;
          min-height: 390px;
          padding: 22px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background:
            repeating-conic-gradient(
              #10151c 0% 25%,
              #0c1117 0% 50%
            ) 50% / 22px 22px;
        }

        .preview-box img {
          max-width: 88%;
          max-height: 285px;
          object-fit: contain;
          filter:
            drop-shadow(
              0 25px 35px rgba(0,0,0,0.45)
            );
        }

        .file-name {
          margin-top: 20px;
          color: #dce3eb;
          font-size: 13px;
          font-weight: 700;
          max-width: 90%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .removed {
          color: #36e7a0;
          margin-top: 7px;
          font-size: 11px;
        }

        .generate-panel {
          margin-top: 24px;
          padding: 20px;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 17px;
          background: #0a0e14;
        }

        .generate-button {
          width: 100%;
          border: 0;
          border-radius: 12px;
          padding: 15px;
          cursor: pointer;
          color: #031016;
          font-weight: 850;
          letter-spacing: 0.08em;
          font-size: 12px;
          background:
            linear-gradient(
              100deg,
              #41e5ff,
              #4587ff
            );
          box-shadow:
            0 12px 30px rgba(32,169,255,0.18);
          transition: 0.2s;
        }

        .generate-button:hover {
          transform: translateY(-1px);
          box-shadow:
            0 15px 35px rgba(32,169,255,0.3);
        }

        .generate-button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          transform: none;
        }

        .error-box {
          margin-top: 16px;
          padding: 13px 15px;
          border-radius: 10px;
          background: rgba(255,65,90,0.08);
          border: 1px solid rgba(255,65,90,0.25);
          color: #ff8d9c;
          font-size: 12px;
          line-height: 1.5;
        }

        .processing {
          padding: 70px 30px;
          text-align: center;
        }

        .processing-orb {
          width: 82px;
          height: 82px;
          margin: 0 auto 25px;
          border-radius: 50%;
          border: 2px solid rgba(52,225,255,0.18);
          border-top-color: #45e6ff;
          animation: spin 1s linear infinite;
          box-shadow:
            0 0 40px rgba(45,218,255,0.1);
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .processing h2 {
          margin: 0;
          font-size: 25px;
        }

        .processing p {
          color: #687383;
          margin: 10px 0 30px;
        }

        .progress-track {
          width: min(600px, 100%);
          height: 7px;
          margin: auto;
          background: #141a22;
          border-radius: 999px;
          overflow: hidden;
        }

        .progress-bar {
          height: 100%;
          border-radius: inherit;
          background:
            linear-gradient(
              90deg,
              #42e7ff,
              #4a86ff
            );
          transition: width 0.25s ease;
        }

        .progress-value {
          margin-top: 12px;
          color: #4edfff;
          font-size: 12px;
          font-weight: 700;
        }

        .processing-grid {
          max-width: 720px;
          margin: 34px auto 0;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .process-tile {
          padding: 15px;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 13px;
          background: #0a0e14;
          text-align: left;
        }

        .process-tile span {
          display: block;
          color: #4fe3ff;
          font-size: 9px;
          letter-spacing: 0.12em;
          margin-bottom: 7px;
        }

        .process-tile strong {
          font-size: 11px;
          color: #abb5c1;
        }

        .result-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 22px;
        }

        .ready-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 11px;
          border-radius: 999px;
          background: rgba(47,225,157,0.08);
          border: 1px solid rgba(47,225,157,0.18);
          color: #43e4a4;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .result-header h2 {
          margin: 7px 0 0;
          font-size: 24px;
        }

        .result-layout {
          display: grid;
          grid-template-columns: 0.75fr 1.25fr;
          gap: 20px;
        }

        .source-card,
        .viewer-card {
          border: 1px solid rgba(255,255,255,0.07);
          background: #080c12;
          border-radius: 18px;
          overflow: hidden;
        }

        .source-card {
          min-height: 460px;
          display: flex;
          flex-direction: column;
        }

        .source-title,
        .viewer-title {
          padding: 16px 18px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          color: #8d99a8;
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .source-image {
          flex: 1;
          min-height: 400px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 25px;
          background:
            repeating-conic-gradient(
              #10151c 0% 25%,
              #0c1117 0% 50%
            ) 50% / 22px 22px;
        }

        .source-image img {
          max-width: 100%;
          max-height: 380px;
          object-fit: contain;
        }

        .viewer-card {
          min-height: 460px;
        }

        .viewer {
          height: 400px;
          background:
            radial-gradient(
              circle at center,
              #111a25,
              #06090d 70%
            );
        }

        .viewer-loading {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: #667281;
          font-size: 12px;
        }

        .loader {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 2px solid #26313d;
          border-top-color: #45e6ff;
          animation: spin 0.8s linear infinite;
        }

        .viewer-controls {
          padding: 15px;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex;
          gap: 8px;
        }

        .variant-button {
          flex: 1;
          border: 1px solid #252f3b;
          background: #0d131b;
          color: #748091;
          padding: 10px;
          border-radius: 9px;
          cursor: pointer;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .variant-button.active {
          border-color: #39ddfa;
          background: rgba(46,216,250,0.09);
          color: #51e6ff;
        }

        .download-row {
          margin-top: 20px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .download-button {
          text-decoration: none;
          text-align: center;
          padding: 13px;
          border-radius: 11px;
          background: #111720;
          border: 1px solid #283442;
          color: #d7e0e9;
          font-size: 11px;
          font-weight: 750;
        }

        .download-button:hover {
          border-color: #3ee2ff;
          color: white;
        }

        .bottom-actions {
          margin-top: 22px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .reset-button {
          border: 0;
          background: transparent;
          color: #687484;
          cursor: pointer;
          font-size: 12px;
        }

        .reset-button:hover {
          color: white;
        }

        .engine-info {
          color: #4c5968;
          font-size: 11px;
        }

        .footer {
          text-align: center;
          padding: 0 20px 45px;
          color: #394351;
          font-size: 11px;
          letter-spacing: 0.08em;
        }

        @media (max-width: 800px) {

          .nav-links {
            display: none;
          }

          .engine-pill {
            display: none;
          }

          .hero {
            padding-top: 48px;
          }

          .steps {
            grid-template-columns: 1fr;
          }

          .step {
            border-right: 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
          }

          .step:last-child {
            border-bottom: 0;
          }

          .upload-grid,
          .result-layout {
            grid-template-columns: 1fr;
          }

          .content {
            padding: 20px;
          }

          .processing-grid {
            grid-template-columns: 1fr;
          }

          .download-row {
            grid-template-columns: 1fr;
          }

          .bottom-actions {
            gap: 15px;
            flex-direction: column;
          }
        }

      `}</style>


      <header className="navbar">

        <div className="navbar-inner">

          <div className="brand">

            <div className="brand-mark">
              V
            </div>

            <div className="brand-name">
              VEXA
            </div>

          </div>

          <nav className="nav-links">
            <span>2D → 3D</span>
            <span>AI Reconstruction</span>
            <span>Export</span>
          </nav>

          <div className="engine-pill">
            AI 3D ENGINE
          </div>

        </div>

      </header>


      <section className="hero">

        <div className="eyebrow">
          AI POWERED 3D RECONSTRUCTION
        </div>

        <h1>
          Transform Images
          <br />
          into 3D Instantly
        </h1>

        <p>
          Upload a single image and VEXA reconstructs
          the visible object into an editable 3D model
          while preserving the original appearance.
        </p>

      </section>


      <section className="workspace">

        <div className="workspace-card">

          <div className="steps">

            <div
              className={`step ${
                stage === "upload"
                  ? "active"
                  : ""
              }`}
            >

              <div className="step-number">
                01
              </div>

              <div className="step-text">
                <small>Step 01</small>
                <strong>Upload Image</strong>
              </div>

            </div>


            <div
              className={`step ${
                stage === "processing"
                  ? "active"
                  : ""
              }`}
            >

              <div className="step-number">
                02
              </div>

              <div className="step-text">
                <small>Step 02</small>
                <strong>AI Reconstruction</strong>
              </div>

            </div>


            <div
              className={`step ${
                stage === "result"
                  ? "active"
                  : ""
              }`}
            >

              <div className="step-number">
                03
              </div>

              <div className="step-text">
                <small>Step 03</small>
                <strong>3D Export</strong>
              </div>

            </div>

          </div>


          <div className="content">

            {stage === "upload" && (

              <>

                <div className="upload-grid">

                  <div>

                    <div className="section-label">

                      <h2>
                        Upload your image
                      </h2>

                      <span>
                        PNG / JPG / JPEG
                      </span>

                    </div>

                    <div
                      className={`drop-zone ${
                        dragging
                          ? "dragging"
                          : ""
                      }`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() =>
                        setDragging(false)
                      }
                      onDrop={handleDrop}
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                    >

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg"
                        onChange={handleInput}
                        style={{
                          display: "none"
                        }}
                      />

                      {!preview ? (

                        <div className="drop-content">

                          <div className="upload-icon">
                            ↑
                          </div>

                          <h3>
                            Drag & Drop Your Image
                          </h3>

                          <p>
                            or click to browse from
                            your computer
                          </p>

                          <button
                            className="browse-button"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              fileInputRef.current?.click();
                            }}
                          >
                            Choose Image
                          </button>

                        </div>

                      ) : (

                        <div className="preview-box">

                          <img
                            src={preview}
                            alt="Prepared input"
                          />

                          <div className="file-name">
                            {selectedFile?.name}
                          </div>

                          <div className="removed">
                            ✓ Background removed
                          </div>

                        </div>

                      )}

                    </div>

                  </div>


                  <div>

                    <div className="section-label">

                      <h2>
                        Reconstruction
                      </h2>

                      <span>
                        VEXA ENGINE
                      </span>

                    </div>

                    <div
                      className="preview-box"
                      style={{
                        minHeight: 390
                      }}
                    >

                      {preview ? (

                        <>
                          <img
                            src={preview}
                            alt="VEXA input"
                          />

                          <div className="file-name">
                            Ready for 3D reconstruction
                          </div>

                          <div className="removed">
                            ✓ Object isolated
                          </div>
                        </>

                      ) : (

                        <div
                          style={{
                            textAlign: "center",
                            color: "#566272"
                          }}
                        >
                          <div
                            style={{
                              fontSize: 42,
                              marginBottom: 15,
                              opacity: 0.35
                            }}
                          >
                            ◇
                          </div>

                          <div>
                            Your prepared image
                          </div>

                          <div
                            style={{
                              marginTop: 7,
                              fontSize: 11
                            }}
                          >
                            will appear here
                          </div>
                        </div>

                      )}

                    </div>

                  </div>

                </div>


                <div className="generate-panel">

                  <button
                    className="generate-button"
                    disabled={!selectedFile}
                    onClick={generateModel}
                  >
                    GENERATE 3D MODEL
                  </button>

                </div>


                {error && (

                  <div className="error-box">
                    <strong>VEXA ERROR</strong>
                    <br />
                    {error}
                  </div>

                )}

              </>

            )}


            {stage === "processing" && (

              <div className="processing">

                <div className="processing-orb"></div>

                <h2>
                  Processing Your Image
                </h2>

                <p>
                  {status}
                </p>

                <div className="progress-track">

                  <div
                    className="progress-bar"
                    style={{
                      width: `${progress}%`
                    }}
                  />

                </div>

                <div className="progress-value">
                  {progress}%
                </div>


                <div className="processing-grid">

                  <div className="process-tile">
                    <span>01</span>
                    <strong>
                      Image preparation
                    </strong>
                  </div>

                  <div className="process-tile">
                    <span>02</span>
                    <strong>
                      Silhouette reconstruction
                    </strong>
                  </div>

                  <div className="process-tile">
                    <span>03</span>
                    <strong>
                      Texture & GLB export
                    </strong>
                  </div>

                </div>

              </div>

            )}


            {stage === "result" && currentModel && (

              <>

                <div className="result-header">

                  <div>

                    <div className="ready-badge">
                      ● MODEL READY
                    </div>

                    <h2>
                      Your 3D Model
                    </h2>

                  </div>

                  <div className="engine-info">
                    VEXA AI 3D ENGINE
                  </div>

                </div>


                <div className="result-layout">

                  <div className="source-card">

                    <div className="source-title">
                      Original / Prepared Image
                    </div>

                    <div className="source-image">

                      {preview && (
                        <img
                          src={preview}
                          alt="Original prepared object"
                        />
                      )}

                    </div>

                  </div>


                  <div className="viewer-card">

                    <div className="viewer-title">
                      Interactive 3D Model
                    </div>

                    <div className="viewer">

                      <ModelViewer
                        modelUrl={currentModel}
                      />

                    </div>


                    <div className="viewer-controls">

                      <button
                        className={`variant-button ${
                          activeModel === "color"
                            ? "active"
                            : ""
                        }`}
                        onClick={() =>
                          setActiveModel("color")
                        }
                      >
                        COLOR
                      </button>

                      <button
                        className={`variant-button ${
                          activeModel === "noColor"
                            ? "active"
                            : ""
                        }`}
                        onClick={() =>
                          setActiveModel("noColor")
                        }
                      >
                        NO COLOR
                      </button>

                    </div>

                  </div>

                </div>


                <div className="download-row">

                  {colorUrl && (

                    <a
                      className="download-button"
                      href={colorUrl}
                      download="vexa_color_model.glb"
                    >
                      ↓ DOWNLOAD COLOR GLB
                    </a>

                  )}

                  {noColorUrl && (

                    <a
                      className="download-button"
                      href={noColorUrl}
                      download="vexa_no_color_model.glb"
                    >
                      ↓ DOWNLOAD NO COLOR GLB
                    </a>

                  )}

                </div>


                <div className="bottom-actions">

                  <button
                    className="reset-button"
                    onClick={resetProject}
                  >
                    ← Upload Another Image
                  </button>

                  <div className="engine-info">
                    Editable GLB • COLOR + NO COLOR
                  </div>

                </div>

              </>

            )}

          </div>

        </div>

      </section>


      <footer className="footer">
        VEXA · AI 2D TO 3D CONVERTER · 3D RECONSTRUCTION ENGINE
      </footer>

    </main>
  );
}