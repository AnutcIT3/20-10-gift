-- Composite indexes for performance (PLAN.md requirement)
-- Gallery: optimize ORDER BY display_order queries per student
CREATE INDEX idx_gallery_student_order ON gallery (student_id, display_order);

-- Letters: optimize filtering by status + ordering by created_at per student
CREATE INDEX idx_letters_student_status ON letters (student_id, status, created_at);
