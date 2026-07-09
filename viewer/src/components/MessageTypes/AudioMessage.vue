<template>
  <div class="audio-message" :style="{ width: width, maxWidth:maxWidth }">
    <div class="audio-controls">
      <div class="play-button" @click="togglePlay" :style="{ color: color }">
        <svg v-if="!isPlaying" id="play_circle_filled_24" viewBox="0 0 24 24" fill="none"
             xmlns="http://www.w3.org/2000/svg">
          <path fill-rule="evenodd" clip-rule="evenodd"
                d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM10.7773 8.51823C10.4451 8.29671 10 8.53491 10 8.93426V15.0657C10 15.4651 10.4451 15.7033 10.7774 15.4818L15.376 12.416C15.6728 12.2181 15.6728 11.7819 15.376 11.584L10.7773 8.51823Z"
                fill="currentColor"></path>
        </svg>
        <svg v-else id="pause_circle_filled_24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fill-rule="evenodd" clip-rule="evenodd"
                d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM9 8H11V16H9L9 8ZM15 8H13V16H15V8Z"
                fill="currentColor"></path>
        </svg>
      </div>

      <div ref="waveform" class="waveform-container"></div>

      <div class="audio-duration" :style="{ color: color }">
        {{ formattedDuration }}
      </div>
    </div>
  </div>
</template>

<script>
import WaveSurfer from 'wavesurfer.js';

export default {
  name: 'AudioMessage',
  props: {
    src: {
      type: String,
      required: true
    },
    width: {
      type: String,
      default: 'auto'
    },
    maxWidth: {
      type: String,
      default: '70%'
    },
    color: {
      type: String,
      default: 'black'
    }
  },
  data() {
    return {
      wavesurfer: null,
      isPlaying: false,
      duration: 0
    };
  },
  computed: {
    formattedDuration() {
      const minutes = Math.floor(this.duration / 60);
      const seconds = Math.floor(this.duration % 60);

      if (minutes > 0) {
        return `${minutes}′${seconds.toString().padStart(2, '0')}″`;
      } else {
        return `${seconds}″`;
      }
    }
  },
  mounted() {
    this.initWaveSurfer();
  },
  beforeDestroy() {
    if (this.wavesurfer) {
      this.wavesurfer.destroy();
    }
  },
  methods: {
    initWaveSurfer() {
      this.wavesurfer = WaveSurfer.create({
        container: this.$refs.waveform,
        waveColor: this.color,
        progressColor: this.color,
        cursorColor: this.color,
        cursorWidth: 2,
        barWidth: 2,
        barGap: 2,
        barHeight: 2,
        barRadius: 0,
        height: 20,
        responsive: true,
        interact: true,
        hideScrollbar: true,
        normalize: true,
        partialRender: true,
        dragToSeek: {
          debounceTime: 0
        },
        autoplay: false,
      });

      this.wavesurfer.load(this.src);

      this.wavesurfer.on('ready', () => {
        this.duration = this.wavesurfer.getDuration();
      });

      this.wavesurfer.on('play', () => {
        this.isPlaying = true;
      });

      this.wavesurfer.on('pause', () => {
        this.isPlaying = false;
      });

      this.wavesurfer.on('finish', () => {
        this.isPlaying = false;
      });

      this.wavesurfer.on('seek', () => {
        if (this.wavesurfer.isPlaying()) {
          this.isPlaying = true;
        }
      });
    },
    togglePlay() {
      this.wavesurfer.playPause();
    },
  }
}
</script>

<style scoped>
.audio-message {
  /*border: 1px solid #ddd;*/
  /*border-radius: 8px;*/
  padding: 0 6px;
  /*background-color: #f8f8f8;*/
  /*background-color: #0099ff;*/
  /*box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);*/
  height: 38px;
}

.audio-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
}

.play-button {
  width: 25px;
  height: 25px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  outline: none;
  background: none;
  padding: 0;
}

.play-button svg {
  width: 25px;
  height: 25px;
}

.waveform-container {
  flex-grow: 1;
  min-width: 0;
}

.audio-duration {
  font-size: 14px;
  flex-shrink: 0;
}

.waveform-container ::part(canvases) {
  opacity: 0.4;
  position: relative;
}

.waveform-container ::part(cursor) {
  opacity: 0.9;
  filter: blur(0.1px);
}

.waveform-container ::part(wrapper) {
  height: 25px;
  cursor: e-resize;
}

.waveform-container ::part(progress) {
  height: unset;
}

.waveform-container ::part(progress), .waveform-container ::part(canvases) {
  top: 50%;
  transform: translateY(-50%);
}
</style>