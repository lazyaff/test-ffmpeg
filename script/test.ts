import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegPath as string);

function addTextToVideo() {
  console.log("add text to video");

  const videoPath = path.resolve("public/test.mp4");
  const fontPath = path.resolve("public/test.ttf").replace(/\\/g, "\\\\");
  const datetime = Date.now();

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .videoFilters([
        "fade=t=out:st=9:d=1",
        `drawtext=text='Lorem Ipsum Dolor Sit Amet':fontfile='${fontPath}':fontsize=100:fontcolor=white:x=(w-text_w)/2:y=h-850:alpha='if(lt(t,3),0,if(lt(t,4),(t-3)/1,if(lt(t,6),1,if(lt(t,7),(7-t)/1,0))))'`,
      ])
      //   .save(`video_with_text-${datetime}.mp4`)
      .save("video_with_text.mp4")
      .on("end", resolve)
      .on("error", reject);
  });
}

function imageToVideo() {
  console.log("image to video");

  const imagePath = path.resolve("public/test.jpg");
  const datetime = Date.now();

  return new Promise((resolve, reject) => {
    ffmpeg(imagePath)
      .loop(5) // durasi video 5 detik
      .fps(30)
      .videoCodec("libx264") // h264
      .outputOptions("-pix_fmt yuv420p")
      .videoFilters(
        "scale='min(iw,1920)':'min(ih,1080)':force_original_aspect_ratio=decrease," +
          "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black," +
          "fade=t=in:st=0:d=1",
      )
      //   .save(`image_video-${datetime}.mp4`)
      .save("image_video.mp4")
      .on("end", resolve)
      .on("error", reject);
  });
}

function mergeVideos() {
  console.log("merge videos");

  const listFile = "list.txt";
  const video1 = "video_with_text.mp4";
  const video2 = "image_video.mp4";

  fs.writeFileSync(listFile, `file '${video1}'\nfile '${video2}'`);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .save("final.mp4")
      .on("end", resolve)
      .on("error", reject)
      .on("end", cleanup)
      .on("error", cleanup);

    function cleanup() {
      [listFile, video1, video2].forEach((file) => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          console.log(`Deleted ${file}`);
        }
      });
    }
  });
}

function addAudioToVideo() {
  console.log("add audio to video");

  const audioPath = path.resolve("public/test.mp3").replace(/\\/g, "/");
  const videoPath = path.resolve("final.mp4").replace(/\\/g, "/");
  const datetime = Date.now();

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .input(audioPath)
      .audioFilters([`afade=t=in:st=0:d=1`, `afade=t=out:st=14:d=1`])
      .outputOptions([
        "-c:v copy", // video tetap copy, tidak reencode
        "-c:a aac", // audio convert ke AAC
        "-map 0:v:0", // ambil video dari input pertama
        "-map 1:a:0", // ambil audio dari input kedua
        "-shortest", // optional: berhenti di durasi paling pendek
      ])
      .save(`final_banget_${datetime}.mp4`)
      .on("end", resolve)
      .on("error", reject);
  });
}

async function processVideo() {
  await addTextToVideo();
  await imageToVideo();
  await mergeVideos();
  await addAudioToVideo();

  console.log("Video selesai dibuat 🎉");
}

processVideo();
