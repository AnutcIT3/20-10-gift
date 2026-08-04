import { lazy, Suspense } from 'react'
import { Navigate, Routes, Route } from 'react-router-dom'
import ProtectedAdminRoute from './components/ProtectedAdminRoute'
import AdminSwitch from './components/AdminSwitch'
import MusicPlayer from './components/MusicPlayer'
import './App.css'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const GiftPage = lazy(() => import('./pages/GiftPage'))
const CelebrationPage = lazy(() => import('./pages/CelebrationPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const LoginPage = lazy(() => import('./pages/admin/LoginPage'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const StudentManager = lazy(() => import('./pages/admin/StudentManager'))
const ClassroomSeating = lazy(() => import('./pages/admin/ClassroomSeating'))
const GalleryManager = lazy(() => import('./pages/admin/GalleryManager'))
const LetterManager = lazy(() => import('./pages/admin/LetterManager'))

function App() {
  return (
    <>
      <AdminSwitch />
      <MusicPlayer />
      <Suspense fallback={<div className="app-route-loading" role="status">Đang tải...</div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/gift/:accessCode" element={<GiftPage />} />
          <Route path="/celebrate/:name" element={<CelebrationPage />} />
          <Route path="/girls" element={<Navigate to="/" replace />} />
          <Route path="/boys-wish" element={<Navigate to="/" replace />} />
          <Route path="/admin/login" element={<LoginPage />} />
          <Route element={<ProtectedAdminRoute />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="students" element={<StudentManager />} />
              <Route path="seating" element={<ClassroomSeating />} />
              <Route path="gallery" element={<GalleryManager />} />
              <Route path="letters" element={<LetterManager />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  )
}

export default App
