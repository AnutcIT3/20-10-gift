import Polaroid from './paper/Polaroid'

/**
 * Ảnh đã chọn để gửi kèm lời chúc (tối đa 4), mỗi ảnh có nút bỏ riêng.
 * picks: [{ id, preview }] từ useImagePicks.
 */
function PickedImages({ picks, onRemove, buttonClassName = 'btn-dashed', label = 'Ảnh sẽ gửi kèm' }) {
  if (!picks.length) return null
  return (
    <ul className="picked-images" aria-label={label}>
      {picks.map((pick, index) => (
        <li key={pick.id}>
          <Polaroid src={pick.preview} alt={`Ảnh ${index + 1} sẽ gửi kèm`} small rotate={index % 2 ? 2 : -2} tape="none" />
          <button type="button" className={buttonClassName} onClick={() => onRemove(pick.id)} aria-label={`Bỏ ảnh ${index + 1}`}>
            Bỏ
          </button>
        </li>
      ))}
    </ul>
  )
}

export default PickedImages
