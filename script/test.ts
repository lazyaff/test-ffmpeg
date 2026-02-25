import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegPath as string);

type TextOverlay = {
  text: string;
  start: number;
  end: number;
  x?: string;
  y?: string;
  textAlign?: "left" | "center" | "right";
  fontSize?: number;
  fontColor?: string;
  fontPath: string;
  animation?: Animation;
  idleAnimation?: IdleAnimation;
};

type IdleAnimation = {
  type: "float"; // bisa dikembangin nanti: "shake", "pulse", dll
  amplitude?: number; // seberapa jauh naik-turun (px), default 10
  speed?: number; // seberapa cepat (cycle per detik), default 1
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
  | "zoom"
  | "none";

type EasingType = "linear" | "ease-in" | "ease-out" | "ease-in-out";

type PhaseAnim = {
  type: AnimationType;
  duration: number;
  // buat kalo zoom
  from?: number;
  to?: number;
  overshoot?: number;
  easing?: EasingType;
};

type Animation = {
  in?: PhaseAnim;
  hold?: number;
  out?: PhaseAnim;
};

function buildSlideAndFadeAnim({
  start,
  end,
  animation,
  isText = false,
  customX,
  customY,
}: {
  start: number;
  end: number;
  animation?: Animation;
  isText?: boolean;
  customX?: string; // <-- tambah
  customY?: string; // <-- tambah
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
  const clampedEnd = Math.min(outEnd, end); // <-- pakai yang lebih kecil

  // Gunakan custom jika ada, fallback ke center
  const restX = customX ?? `(${W}-${OBJ_W})/2`;
  const restY = customY ?? `(${H}-${OBJ_H})/2`;

  const result: any = {
    enable: `between(t,${start},${clampedEnd})`, // <-- pakai clampedEnd
  };

  const progressOut =
    outDur > 0
      ? `max(0,min(1,(t-${holdEnd})/${outDur}))` // <-- clamp 0-1
      : "1";

  const progressIn =
    inDur > 0
      ? `max(0,min(1,(t-${start})/${inDur}))` // <-- clamp 0-1
      : "1";

  const easedProgressIn = buildEasedProgress(
    progressIn,
    animation.in?.easing ?? "linear",
  );
  const easedProgressOut = buildEasedProgress(
    progressOut,
    animation.out?.easing ?? "linear",
  );

  // ======================
  // FADE
  // ======================
  if (animation.in?.type === "fade" || animation.out?.type === "fade") {
    const fadeIn =
      animation.in?.type === "fade" && inDur > 0 ? easedProgressIn : "1";
    const fadeOut =
      animation.out?.type === "fade" && outDur > 0
        ? `1-${easedProgressOut}`
        : "1";
    result.alpha = `if(lt(t,${inEnd}),${fadeIn},if(lt(t,${holdEnd}),1,${fadeOut}))`;
  }

  const dirIn = animation.in?.type;
  const dirOut = animation.out?.type;

  // ======================
  // X AXIS
  // ======================
  const isXIn = dirIn === "slide-left" || dirIn === "slide-right";
  const isXOut = dirOut === "slide-left" || dirOut === "slide-right";

  if (isXIn || isXOut) {
    let startX = restX;
    let endX = restX;

    if (dirIn === "slide-left") startX = W;
    if (dirIn === "slide-right") startX = `(-${OBJ_W})`;
    if (dirOut === "slide-left") endX = `(-${OBJ_W})`;
    if (dirOut === "slide-right") endX = W;

    const slideInX =
      isXIn && inDur > 0
        ? `${startX}+${easedProgressIn}*(${restX}-(${startX}))`
        : restX;

    const slideOutX =
      isXOut && outDur > 0
        ? `${restX}+${easedProgressOut}*(${endX}-(${restX}))`
        : restX;

    result.x =
      `if(lt(t,${inEnd}),${slideInX},` +
      `if(lt(t,${holdEnd}),${restX},${slideOutX}))`;
  }

  // ======================
  // Y AXIS
  // ======================
  const isYIn = dirIn === "slide-up" || dirIn === "slide-down";
  const isYOut = dirOut === "slide-up" || dirOut === "slide-down";

  if (isYIn || isYOut) {
    let startY = restY;
    let endY = restY;

    if (dirIn === "slide-up") startY = H;
    if (dirIn === "slide-down") startY = `-${OBJ_H}`;
    if (dirOut === "slide-up") endY = `-${OBJ_H}`;
    if (dirOut === "slide-down") endY = H;

    const slideInY =
      isYIn && inDur > 0
        ? `${startY}+${easedProgressIn}*(${restY}-(${startY}))`
        : restY;

    const slideOutY =
      isYOut && outDur > 0
        ? `${restY}+${easedProgressOut}*(${endY}-(${restY}))`
        : restY;

    result.y =
      `if(lt(t,${inEnd}),${slideInY},` +
      `if(lt(t,${holdEnd}),${restY},${slideOutY}))`;
  }

  return result;
}

function buildZoomFontSize({
  start,
  animation,
  baseFontSize,
}: {
  start: number;
  animation?: Animation;
  baseFontSize: number;
}): string | null {
  const inAnim = animation?.in;
  const outAnim = animation?.out;
  const inDur = inAnim?.duration ?? 0;
  const holdDur = animation?.hold ?? 0;
  const outDur = outAnim?.duration ?? 0;

  const inEnd = start + inDur;
  const holdEnd = inEnd + holdDur;
  const outEnd = holdEnd + outDur;

  const hasZoomIn = inAnim?.type === "zoom" && inDur > 0;
  const hasZoomOut = outAnim?.type === "zoom" && outDur > 0;

  if (!hasZoomIn && !hasZoomOut) return null;

  const fromSize = hasZoomIn
    ? (inAnim!.from ?? 0.2) * baseFontSize
    : baseFontSize;
  const toSizeIn = hasZoomIn ? (inAnim!.to ?? 1) * baseFontSize : baseFontSize;

  // ======================
  // ZOOM IN
  // ======================
  const overshoot = hasZoomIn ? inAnim!.overshoot : undefined;
  let zoomInExpr: string;

  if (hasZoomIn && overshoot) {
    const peakSize = overshoot * baseFontSize;
    const t1 = start + inDur * 0.7;

    // Easing di fase 1: from → peak
    const rawP1 = `(t-${start})/${inDur * 0.7}`;
    const easedP1 = buildEasedProgress(rawP1, inAnim!.easing ?? "ease-out");
    const phase1 = `${fromSize}+${easedP1}*(${peakSize}-${fromSize})`;

    // Fase 2: peak → toSizeIn (linear, biar terasa snap balik)
    const rawP2 = `(t-${t1})/${inDur * 0.3}`;
    const phase2 = `${peakSize}+${rawP2}*(${toSizeIn}-${peakSize})`;

    zoomInExpr = `if(lt(t,${t1}),${phase1},${phase2})`;
  } else if (hasZoomIn) {
    const rawP = `(t-${start})/${inDur}`;
    const easedP = buildEasedProgress(rawP, inAnim!.easing ?? "ease-out");
    zoomInExpr = `${fromSize}+${easedP}*(${toSizeIn}-${fromSize})`;
  } else {
    zoomInExpr = `${baseFontSize}`;
  }

  // ======================
  // ZOOM OUT
  // ======================
  const fromSizeOut = hasZoomOut
    ? (outAnim!.from ?? 1) * baseFontSize
    : baseFontSize;
  const toSizeOut = hasZoomOut
    ? (outAnim!.to ?? 0.2) * baseFontSize
    : baseFontSize;

  let zoomOutExpr: string;

  if (hasZoomOut) {
    const rawP = `(t-${holdEnd})/${outDur}`;
    const easedP = buildEasedProgress(rawP, outAnim!.easing ?? "ease-in");
    zoomOutExpr = `${fromSizeOut}+${easedP}*(${toSizeOut}-${fromSizeOut})`;
  } else {
    zoomOutExpr = `${baseFontSize}`;
  }

  return (
    `if(lt(t,${inEnd}),${zoomInExpr},` +
    `if(lt(t,${holdEnd}),${baseFontSize},${zoomOutExpr}))`
  );
}

function buildIdleFloatY({
  start,
  baseY,
  idleAnimation,
}: {
  start: number;
  baseY: string;
  idleAnimation: IdleAnimation;
}): string {
  const amplitude = idleAnimation.amplitude ?? 10;
  const speed = idleAnimation.speed ?? 1;

  // sin wave: baseY + amplitude * sin(2π * speed * (t - start))
  // sin bernilai -1 sampai 1, jadi teks naik-turun sebesar amplitude px
  return `${baseY}+${amplitude}*sin(2*PI*${speed}*(t-${start}))`;
}

function buildEasedProgress(p: string, easing: EasingType = "linear"): string {
  switch (easing) {
    case "ease-in":
      // mulai lambat, makin cepat: p^3
      return `(${p})*(${p})*(${p})`;

    case "ease-out":
      // mulai cepat, makin lambat: 1-(1-p)^3
      return `(1-(1-(${p}))*(1-(${p}))*(1-(${p})))`;

    case "ease-in-out":
      // lambat di awal & akhir: smoothstep = 3p²-2p³
      return `((${p})*(${p})*(3-2*(${p})))`;

    case "linear":
    default:
      return p;
  }
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

      const imageInputIndex = idx + 1; // karena 0 = video utama
      let imageStream = `${imageInputIndex}:v`;

      const outputName = `v_img_${idx}`;

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

      // Build slide/fade animation for overlay position
      const anim = buildSlideAndFadeAnim({
        start: img.start,
        end: img.end,
        animation: img.animation,
        isText: false,
        customX: img.x,
        customY: img.y,
      });

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
      const anim = buildSlideAndFadeAnim({
        start: txt.start,
        end: txt.end,
        animation: txt.animation,
        isText: true,
        customX: txt.x,
        customY: txt.y,
      });
      const outputName = `v_text_${idx}`;
      const baseFontSize = txt.fontSize ?? 48;

      const escapedFontPath = txt.fontPath
        .replace(/\\/g, "/")
        .replace(/^([A-Za-z]):/, "$1\\\\:");

      // Cek apakah ada zoom animation
      const zoomFontSize = buildZoomFontSize({
        start: txt.start,
        animation: txt.animation,
        baseFontSize,
      });

      // Base Y: pakai dari anim slide jika ada, fallback ke txt.y atau default
      const baseY = anim.y ?? txt.y ?? "(h-text_h)/2";

      // Jika ada idleAnimation, override Y dengan float expression
      const finalY = txt.idleAnimation
        ? buildIdleFloatY({
            start: txt.start,
            baseY,
            idleAnimation: txt.idleAnimation,
          })
        : baseY;

      const textOptions: any = {
        text: txt.text,
        text_align: txt.textAlign ?? "center",
        fontfile: escapedFontPath,
        fontsize: zoomFontSize ?? baseFontSize, // pakai dynamic jika ada zoom
        fontcolor: txt.fontColor ?? "white",
        x: anim.x ?? txt.x ?? "(w-text_w)/2",
        y: finalY,
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
        w: 1080,
        h: 1920,
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
  // BASE VIDEO & OUTPUT PATH
  const videoPath = path.resolve("public/video.mp4");
  const outputPath = "image-final_video.mp4";

  // FONTS
  const fontThin = path.resolve("public/fonts/font-thin.ttf");
  const fontRegular = path.resolve("public/fonts/font-regular.ttf");
  const fontBold = path.resolve("public/fonts/font-bold.ttf");
  const fontExtraBold = path.resolve("public/fonts/font-extrabold.ttf");

  // CUSTOM OVERLAY CONTENT
  const imagePath = path.resolve("public/dummy.png");
  const imagePath2 = path.resolve("public/dummy2.png");

  const title = "Teruntuk \nTiara Putri, \nmohon maaf \nlahir batin ya!";

  const title2 = "Halo Tiara Putri, \nSelamat Hari Raya \nIdul Fitri!";
  const subtitle1 =
    "Di hari yang baik ini, \naku ingin menyampaikan \npermohonan maaf \nlahir dan batin..";
  const subtitle2 =
    "Terutama untuk \nkomunikasi yang \nsempat terputus dan \nsilaturahmi kita yang \njarang terjaga di \ntahun lalu.";
  const subtitle3 =
    "Harapanku, semoga \nke depannya kita \nbisa mempererat tali \nsilaturahmi kita dan \nlebih sering \nmenyempatkan \nuntuk bertemu.";

  const receiverName = "Tiara Putri";
  const senderName = "Haikal Surya";

  const closingText = "Semoga Maaf \nMenyembuhkan Luka";

  await addTextAndImageToVideo({
    videoPath,
    outputPath,
    texts: [
      {
        text: title,
        start: 0.5,
        end: 3,
        fontPath: fontBold,
        fontSize: 62,
        fontColor: "#522A0C",
        animation: {
          in: {
            type: "zoom",
            duration: 1,
            from: 0.2,
            to: 1,
            overshoot: 1.15,
          },
          hold: 1.12,
          out: { type: "slide-left", duration: 0.43, easing: "ease-in" },
        },
      },
      {
        text: title2,
        start: 5.5,
        end: 8,
        fontColor: "#522A0C",
        fontPath: fontExtraBold,
        fontSize: 52,
        y: "((h-text_h)/2)-170",
        animation: {
          in: { type: "slide-up", duration: 1.14, easing: "ease-in-out" },
          hold: 1.1,
          out: { type: "slide-right", duration: 0.3, easing: "ease-in" },
        },
        idleAnimation: {
          type: "float",
          amplitude: 5, // naik-turun px
          speed: 0.2, // cycle per detik
        },
      },
      {
        text: subtitle1,
        start: 5.5,
        end: 8,
        fontColor: "#522A0C",
        fontPath: fontBold,
        fontSize: 40,
        y: "((h-text_h)/2) + 80",
        animation: {
          in: { type: "slide-up", duration: 1.14, easing: "ease-in-out" },
          hold: 1.1,
          out: { type: "slide-right", duration: 0.3, easing: "ease-in" },
        },
        idleAnimation: {
          type: "float",
          amplitude: 5, // naik-turun px
          speed: 0.2, // cycle per detik
        },
      },
      {
        text: subtitle2,
        start: 8,
        end: 9.5,
        fontColor: "#522A0C",
        fontPath: fontBold,
        fontSize: 44,
        y: "((h-text_h)/2) - 20",
        animation: {
          in: { type: "fade", duration: 0.1 },
          hold: 1.3,
          out: { type: "slide-right", duration: 0.3, easing: "ease-in" },
        },
        idleAnimation: {
          type: "float",
          amplitude: 30, // naik-turun px
          speed: 0.6, // cycle per detik
        },
      },
      {
        text: subtitle3,
        start: 9.7,
        end: 15,
        fontColor: "#522A0C",
        fontPath: fontBold,
        fontSize: 40,
        y: "((h-text_h)/2) - 30",
        animation: {
          in: { type: "fade", duration: 0.1 },
          hold: 1.25,
          out: { type: "slide-up", duration: 0.5, easing: "ease-in" },
        },
        idleAnimation: {
          type: "float",
          amplitude: 5, // naik-turun px
          speed: 0.6, // cycle per detik
        },
      },
      {
        text: senderName,
        start: 16.3,
        end: 21,
        fontPath: fontBold,
        fontSize: 50,
        y: "((h-text_h)/2) - 680",
        animation: {
          in: { type: "slide-right", duration: 0.8, easing: "ease-out" },
          hold: 6,
        },
      },
      {
        text: receiverName,
        start: 16.3,
        end: 21,
        fontPath: fontBold,
        fontSize: 52,
        x: "((w-text_w)/2) - 305",
        y: "((h-text_h)/2) + 285",
        animation: {
          in: { type: "slide-right", duration: 0.8, easing: "ease-out" },
          hold: 6,
        },
      },
      {
        text: closingText,
        start: 16.3,
        end: 21,
        textAlign: "left",
        fontColor: "#522A0C",
        fontPath: fontExtraBold,
        fontSize: 65,
        x: "((w-text_w)/2) - 80",
        y: "((h-text_h)/2) + 580",
        animation: {
          in: { type: "slide-right", duration: 0.8, easing: "ease-out" },
          hold: 6,
        },
      },
    ],
    images: [
      {
        imagePath: imagePath,
        start: 13.9,
        end: 17,
        width: 650,
        y: "((h-overlay_h)/2)+740",
        animation: {
          in: { type: "slide-right", duration: 0.6, easing: "linear" },
          hold: 1.8,
          out: { type: "slide-right", duration: 0.6, easing: "linear" },
        },
      },
      {
        imagePath: imagePath2,
        start: 16.3,
        end: 21,
        width: 990,
        y: "((h-overlay_h)/2)+572",
        animation: {
          in: { type: "slide-right", duration: 0.8, easing: "linear" },
          hold: 6,
        },
      },
    ],
  });

  console.log("Video selesai dibuat 🎉");
}

processVideo();
