import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegPath as string);

type TextOverlay = {
  text: string;
  start: number;
  end: number;
  x?: string;
  y?: string;
  fontSize?: number;
  fontColor?: string;
  fontPath: string;
  animation?: Animation;
};

type ImageOverlay = {
  imagePath: string;
  start: number;
  end: number;
  x?: string;
  y?: string;
  width?: number; // optional scaling
  animation?: Animation;
};

type VideoOverlayOptions = {
  videoPath: string;
  outputPath: string;
  texts?: TextOverlay[];
  images?: ImageOverlay[];
};

type AnimationType =
  | "fade"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "zoom-in"
  | "zoom-out"
  | "none";

type PhaseAnim = {
  type: AnimationType;
  duration: number;
};

type Animation = {
  in?: PhaseAnim;
  hold?: number;
  out?: PhaseAnim;
};

function buildAnimation({
  start,
  animation,
  isText = false,
}: {
  start: number;
  animation?: Animation;
  isText?: boolean;
}) {
  if (!animation) return {};

  const W = isText ? "w" : "main_w";
  const H = isText ? "h" : "main_h";
  const OBJ_W = isText ? "text_w" : "overlay_w";
  const OBJ_H = isText ? "text_h" : "overlay_h";

  const inDur = animation.in?.duration ?? 0;
  const holdDur = animation.hold ?? 0;
  const outDur = animation.out?.duration ?? 0;

  const inEnd = start + inDur;
  const holdEnd = inEnd + holdDur;
  const outEnd = holdEnd + outDur;

  const centerX = `(${W}-${OBJ_W})/2`;
  const centerY = `(${H}-${OBJ_H})/2`;

  const result: any = {
    enable: `between(t,${start},${outEnd})`,
  };

  // ======================
  // FADE
  // ======================
  if (animation.in?.type === "fade" || animation.out?.type === "fade") {
    const fadeIn =
      animation.in?.type === "fade" && inDur > 0
        ? `(t-${start})/${inDur}`
        : "1";

    const fadeOut =
      animation.out?.type === "fade" && outDur > 0
        ? `(${outEnd}-t)/${outDur}`
        : "1";

    result.alpha = `if(lt(t,${inEnd}),${fadeIn},if(lt(t,${holdEnd}),1,${fadeOut}))`;
  }

  // ======================
  // SLIDE (CROSS AXIS SAFE)
  // ======================
  const slideTypes = ["slide-left", "slide-right", "slide-up", "slide-down"];

  if (
    slideTypes.includes(animation.in?.type as string) ||
    slideTypes.includes(animation.out?.type as string)
  ) {
    const dirIn = animation.in?.type;
    const dirOut = animation.out?.type;

    // ======================
    // X AXIS
    // ======================
    let xExpr = centerX;

    const isXIn = dirIn === "slide-left" || dirIn === "slide-right";
    const isXOut = dirOut === "slide-left" || dirOut === "slide-right";

    if (isXIn || isXOut) {
      let startX = centerX;
      let endX = centerX;

      if (dirIn === "slide-left") startX = W;
      if (dirIn === "slide-right") startX = `(-${OBJ_W})`;

      if (dirOut === "slide-left") endX = `(-${OBJ_W})`;
      if (dirOut === "slide-right") endX = W;

      const slideInX =
        isXIn && inDur > 0
          ? `${startX} + (t-${start})*(${centerX}-${startX})/${inDur}`
          : centerX;

      const slideOutX =
        isXOut && outDur > 0
          ? `${centerX} + (t-${holdEnd})*(${endX}-${centerX})/${outDur}`
          : centerX;

      xExpr =
        `if(lt(t,${inEnd}),${slideInX},` +
        `if(lt(t,${holdEnd}),${centerX},${slideOutX}))`;

      result.x = xExpr;
    }

    // ======================
    // Y AXIS
    // ======================
    let yExpr = centerY;

    const isYIn = dirIn === "slide-up" || dirIn === "slide-down";
    const isYOut = dirOut === "slide-up" || dirOut === "slide-down";

    if (isYIn || isYOut) {
      let startY = centerY;
      let endY = centerY;

      if (dirIn === "slide-up") startY = H;
      if (dirIn === "slide-down") startY = `-${OBJ_H}`;

      if (dirOut === "slide-up") endY = `-${OBJ_H}`;
      if (dirOut === "slide-down") endY = H;

      const slideInY =
        isYIn && inDur > 0
          ? `${startY} + (t-${start})*(${centerY}-${startY})/${inDur}`
          : centerY;

      const slideOutY =
        isYOut && outDur > 0
          ? `${centerY} + (t-${holdEnd})*(${endY}-${centerY})/${outDur}`
          : centerY;

      yExpr =
        `if(lt(t,${inEnd}),${slideInY},` +
        `if(lt(t,${holdEnd}),${centerY},${slideOutY}))`;

      result.y = yExpr;
    }
  }

  // ======================
  // ZOOM SUPPORT
  // ======================
  if (animation.in?.type === "zoom-in" || animation.out?.type === "zoom-in") {
    result.scale = `
      if(lt(t,${inEnd}),
         0.5 + (t-${start})*(0.5/${inDur}),
      if(lt(t,${holdEnd}),
         1,
         1 - (t-${holdEnd})*(0.5/${outDur})
      ))
    `;
  }

  return result;
}

function addTextAndImageToVideo({
  videoPath,
  outputPath,
  texts = [],
  images = [],
}: VideoOverlayOptions) {
  console.log("add text and image to video");

  return new Promise((resolve, reject) => {
    const command = ffmpeg(videoPath);

    const complexFilters: any[] = [];
    let lastVideoStream = "0:v";

    // =========================
    // IMAGE OVERLAYS
    // =========================
    images.forEach((img, idx) => {
      command.input(img.imagePath);
      const anim = buildAnimation({
        start: img.start,
        animation: img.animation,
        isText: false,
      });

      const imageInputIndex = idx + 1; // karena 0 = video utama
      let imageStream = `${imageInputIndex}:v`;

      // Scaling (optional)
      if (img.width) {
        const scaledName = `scaled${idx}`;

        complexFilters.push({
          filter: "scale",
          options: {
            w: img.width,
            h: -1, // auto
          },
          inputs: imageStream,
          outputs: scaledName,
        });

        imageStream = scaledName;
      }

      const outputName = `v_img_${idx}`;

      // img over video
      const overlayOptions: any = {
        x: anim.x ?? img.x ?? "(main_w-overlay_w)/2",
        y: anim.y ?? img.y ?? "(main_h-overlay_h)/2",
      };

      if (anim.enable) {
        overlayOptions.enable = anim.enable;
      }

      complexFilters.push({
        filter: "overlay",
        options: overlayOptions,
        inputs: [lastVideoStream, imageStream],
        outputs: outputName,
      });

      lastVideoStream = outputName;
    });

    // =========================
    // TEXT OVERLAYS
    // =========================
    texts.forEach((txt, idx) => {
      const anim = buildAnimation({
        start: txt.start,
        animation: txt.animation,
        isText: true,
      });
      const outputName = `v_text_${idx}`;

      const textOptions: any = {
        text: txt.text,
        fontfile: txt.fontPath.replace(/\\/g, "\\\\"),
        fontsize: txt.fontSize ?? 48,
        fontcolor: txt.fontColor ?? "white",
        x: anim.x ?? txt.x ?? "(w-text_w)/2",
        y: anim.y ?? txt.y ?? "h-200",
      };

      if (anim.enable) {
        textOptions.enable = anim.enable;
      }

      if (anim.alpha) {
        textOptions.alpha = anim.alpha;
      }

      complexFilters.push({
        filter: "drawtext",
        options: textOptions,
        inputs: lastVideoStream,
        outputs: outputName,
      });

      lastVideoStream = outputName;
    });

    // HD output
    const scaledOutput = "final_scaled";

    complexFilters.push({
      filter: "scale",
      options: {
        w: 1920,
        h: 1080,
      },
      inputs: lastVideoStream,
      outputs: scaledOutput,
    });

    lastVideoStream = scaledOutput;

    command
      .complexFilter(complexFilters, lastVideoStream)
      .outputOptions(["-pix_fmt yuv420p"])
      .save(outputPath)
      .on("end", resolve)
      .on("error", reject);
  });
}

async function processVideo() {
  const outputPath = "final_video_18.mp4";
  const videoPath = path.resolve("public/placeholder-video.mp4");
  const imagePath = path.resolve("public/test.jpg");
  const fontPath = path.resolve("public/test.ttf");
  const datetime = Date.now();

  const title = "Teruntuk Tiara Putri, mohon maaf lahir batin ya!";

  const title2 = "Halo Tiara Putri, Selamat Hari Raya Idul Fitri!";
  const subtitle1 =
    "Di hari yang baik ini, aku ingin menyampaikan permohonan maaf lahir dan batin..";
  const subtitle2 =
    "Terutama untuk komunikasi yang sempat terputus dan silaturahmi kita yang jarang terjaga di tahun lalu.";
  const subtitle3 =
    "Harapanku, semoga ke depannya kita bisa mempererat tali silaturahmi kita dan lebih sering menyempatkan untuk bertemu.";

  await addTextAndImageToVideo({
    videoPath,
    outputPath,
    images: [
      {
        imagePath: imagePath,
        start: 0,
        end: 6,
        width: 400,
        animation: {
          in: { type: "slide-right", duration: 1 },
          hold: 2,
          out: { type: "slide-right", duration: 5 },
        },
      },
    ],
    texts: [
      {
        text: title,
        start: 0,
        end: 4,
        fontPath,
        fontSize: 60,
        y: "h-300",
        animation: {
          in: { type: "fade", duration: 1 },
          hold: 2,
          out: { type: "slide-left", duration: 1.5 },
        },
      },
    ],
  });

  console.log("Video selesai dibuat 🎉");
}

processVideo();
