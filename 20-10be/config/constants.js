const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_AUDIO_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = ['jpeg', 'jpg', 'png', 'gif', 'webp'];
const ALLOWED_AUDIO_TYPES = ['mp3', 'wav'];
const ALLOWED_VIDEO_TYPES = ['mp4', 'webm'];

module.exports = { MAX_IMAGE_SIZE, MAX_AUDIO_SIZE, MAX_VIDEO_SIZE, ALLOWED_IMAGE_TYPES, ALLOWED_AUDIO_TYPES, ALLOWED_VIDEO_TYPES };
