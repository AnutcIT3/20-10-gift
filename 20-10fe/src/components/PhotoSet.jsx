import Polaroid from './paper/Polaroid'

/**
 * Ảnh kèm một lời chúc (tối đa 4). Một ảnh hiện y như trước — polaroid mang
 * `className`; nhiều ảnh xếp lưới hai cột, khung lưới mang `className` để giữ
 * đúng chỗ và bề rộng trên trang.
 */
function PhotoSet({ urls, alt, className = '', rotate = -2, lazy = false, tape = 'none' }) {
  if (!urls?.length) return null
  if (urls.length === 1) {
    return <Polaroid src={urls[0]} alt={alt} small rotate={rotate} tape={tape} lazy={lazy} className={className} />
  }
  return (
    <div className={`photo-set ${className}`}>
      {urls.map((url, index) => (
        <Polaroid
          key={`${index}-${url}`}
          src={url}
          alt={`${alt} (${index + 1}/${urls.length})`}
          small
          rotate={index % 2 ? -rotate : rotate}
          tape={tape}
          lazy={lazy}
        />
      ))}
    </div>
  )
}

export default PhotoSet
