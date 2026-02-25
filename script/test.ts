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

  // Progress linear 0→1
  const progressIn = inDur > 0 ? `(t-${start})/${inDur}` : "1";
  const progressOut = outDur > 0 ? `(t-${holdEnd})/${outDur}` : "1";

  // Eased progress
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
    let startX = centerX;
    let endX = centerX;

    if (dirIn === "slide-left") startX = W;
    if (dirIn === "slide-right") startX = `(-${OBJ_W})`;
    if (dirOut === "slide-left") endX = `(-${OBJ_W})`;
    if (dirOut === "slide-right") endX = W;

    // Interpolasi pakai eased progress: from + eased*(to-from)
    const slideInX =
      isXIn && inDur > 0
        ? `${startX}+${easedProgressIn}*(${centerX}-(${startX}))`
        : centerX;

    const slideOutX =
      isXOut && outDur > 0
        ? `${centerX}+${easedProgressOut}*(${endX}-(${centerX}))`
        : centerX;

    result.x =
      `if(lt(t,${inEnd}),${slideInX},` +
      `if(lt(t,${holdEnd}),${centerX},${slideOutX}))`;
  }

  // ======================
  // Y AXIS
  // ======================
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
        ? `${startY}+${easedProgressIn}*(${centerY}-(${startY}))`
        : centerY;

    const slideOutY =
      isYOut && outDur > 0
        ? `${centerY}+${easedProgressOut}*(${endY}-(${centerY}))`
        : centerY;

    result.y =
      `if(lt(t,${inEnd}),${slideInY},` +
      `if(lt(t,${holdEnd}),${centerY},${slideOutY}))`;
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

  // --- OVERSHOOT LOGIC ---
  const overshoot = hasZoomIn ? inAnim!.overshoot : undefined;
  let zoomInExpr: string;

  if (hasZoomIn && overshoot) {
    const peakSize = overshoot * baseFontSize;
    // Fase 1 (0 → 70% durasi): from → peak
    // Fase 2 (70% → 100% durasi): peak → toSizeIn
    const t1 = start + inDur * 0.7;
    const t2 = inEnd;

    const phase1 = `${fromSize}+(t-${start})*(${peakSize}-${fromSize})/${inDur * 0.7}`;
    const phase2 = `${peakSize}+(t-${t1})*(${toSizeIn}-${peakSize})/${inDur * 0.3}`;

    zoomInExpr = `if(lt(t,${t1}),${phase1},${phase2})`;
  } else {
    zoomInExpr = hasZoomIn
      ? `${fromSize}+(t-${start})*(${toSizeIn}-${fromSize})/${inDur}`
      : `${baseFontSize}`;
  }

  const fromSizeOut = hasZoomOut
    ? (outAnim!.from ?? 1) * baseFontSize
    : baseFontSize;
  const toSizeOut = hasZoomOut
    ? (outAnim!.to ?? 0.2) * baseFontSize
    : baseFontSize;

  const zoomOutExpr = hasZoomOut
    ? `${fromSizeOut}+(t-${holdEnd})*(${toSizeOut}-${fromSizeOut})/${outDur}`
    : `${baseFontSize}`;

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
        animation: img.animation,
        isText: false,
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
        animation: txt.animation,
        isText: true,
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
        text_align: "center",
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
  // BASE VIDEO & OUTPUT PATH
  const videoPath = path.resolve("public/placeholder-video.mp4");
  const outputPath = "text-1-final_video.mp4";

  // FONTS
  const fontThin = path.resolve("public/fonts/font-thin.ttf");
  const fontRegular = path.resolve("public/fonts/font-regular.ttf");
  const fontBold = path.resolve("public/fonts/font-bold.ttf");
  const fontExtraBold = path.resolve("public/fonts/font-extrabold.ttf");

  // CUSTOM OVERLAY CONTENT
  const imagePath = path.resolve("public/test.jpg");

  const title = "Teruntuk \nTiara Putri, \nmohon maaf \nlahir batin ya!";

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
    texts: [
      {
        text: title,
        start: 0.5,
        end: 3,
        fontPath: fontBold,
        fontSize: 62,
        // fontColor: "#522A0C",
        animation: {
          in: {
            type: "zoom",
            duration: 1,
            from: 0.2,
            to: 1,
            overshoot: 1.15,
          },
          hold: 1.15,
          out: { type: "slide-left", duration: 0.4, easing: "ease-in" },
        },
      },
      // {
      //   text: title2,
      //   start: 0,
      //   end: 4,
      //   fontPath,
      //   fontSize: 60,
      //   y: "h-1200",
      //   animation: {
      //     in: { type: "zoom", duration: 2, from: 0.2, to: 1 },
      //     hold: 2,
      //     out: { type: "slide-left", duration: 1.5 },
      //   },
      //   idleAnimation: {
      //     type: "float",
      //     amplitude: 150, // naik-turun 15px
      //     speed: 0.2, // cycle per detik
      //   },
      // },
    ],
    // images: [
    //   {
    //     imagePath: imagePath,
    //     start: 0,
    //     end: 6,
    //     width: 400,
    //     animation: {
    //       in: { type: "slide-down", duration: 1 },
    //       hold: 2,
    //       out: { type: "slide-up", duration: 3 },
    //     },
    //   },
    // ],
  });

  console.log("Video selesai dibuat 🎉");
}

processVideo();
