import { createCanvas, loadImage, registerFont } from "canvas";
import fs from "fs";
import path from "path";

registerFont(path.join(process.cwd(), "public", "fonts/font-bold.ttf"), {
  family: "CustomBold",
});

async function mergeImage1() {
  // path image
  const framePath = path.join(process.cwd(), "public", "img-frame-1.png");
  const dummyPath = path.join(process.cwd(), "public", "dummy.png");

  // load image
  const frame = await loadImage(framePath);
  const dummy = await loadImage(dummyPath);

  // buat canvas sesuai ukuran frame
  const canvas = createCanvas(frame.width, frame.height);
  const ctx = canvas.getContext("2d");

  // gambar frame (background)
  ctx.drawImage(frame, 0, 0);

  // posisi dummy (atur sesuai kebutuhan)
  const x = 67.5; // posisi horizontal
  const y = 104.5; // posisi vertical

  // kalau mau resize dummy bisa tambahin width height
  const width = 243;
  const height = 243;

  ctx.drawImage(dummy, x, y, width, height);

  // simpan hasilnya
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync("merged-" + Date.now() + ".png", buffer);

  console.log("Image merged!");
}

async function mergeImage2() {
  // path image
  const framePath = path.join(process.cwd(), "public", "img-frame-2.png");
  const dummyPath = path.join(process.cwd(), "public", "dummy.png");

  // load image
  const frame = await loadImage(framePath);
  const dummy = await loadImage(dummyPath);

  // buat canvas sesuai ukuran frame
  const canvas = createCanvas(frame.width, frame.height);
  const ctx = canvas.getContext("2d");

  // gambar frame (background)
  ctx.drawImage(frame, 0, 0);

  // target box
  const x = 16;
  const y = 39;
  const targetWidth = 379;
  const targetHeight = 330;

  // rasio
  const targetRatio = targetWidth / targetHeight;
  const imageRatio = dummy.width / dummy.height;

  let sx = 0;
  let sy = 0;
  let sWidth = dummy.width;
  let sHeight = dummy.height;

  // kalau gambar lebih lebar dari target → crop horizontal
  if (imageRatio > targetRatio) {
    sHeight = dummy.height;
    sWidth = dummy.height * targetRatio;
    sx = (dummy.width - sWidth) / 2;
    sy = 0;
  } else {
    // kalau gambar lebih tinggi → crop vertical
    sWidth = dummy.width;
    sHeight = dummy.width / targetRatio;
    sx = 0;
    sy = (dummy.height - sHeight) / 2;
  }

  ctx.drawImage(
    dummy,
    sx,
    sy,
    sWidth,
    sHeight,
    x,
    y,
    targetWidth,
    targetHeight,
  );

  // ===== sender name =====
  ctx.fillStyle = "#FBE6D3";
  ctx.font = "17px CustomBold";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Haikal Surya", 145, 10);

  // ===== receiver name =====
  ctx.fillStyle = "#FBE6D3";
  ctx.font = "21px CustomBold";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Haikal Surya", 34, 382);

  // simpan hasilnya
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync("merged-" + Date.now() + ".png", buffer);

  console.log("Image merged!");
}

async function main() {
  mergeImage1();
  //   mergeImage2();
}

main();
