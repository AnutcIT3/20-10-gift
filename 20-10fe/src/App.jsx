import { Routes, Route, Link } from 'react-router-dom'
import GiftPage from './pages/GiftPage'
import LandingPage from './pages/LandingPage'
import BoysWish from "./Boy'swish/Boy'swish"
import Girls from './Girls/Girls'
import ProtectedAdminRoute from './components/ProtectedAdminRoute'
import LoginPage from './pages/admin/LoginPage'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import StudentManager from './pages/admin/StudentManager'
import GalleryManager from './pages/admin/GalleryManager'
import LetterManager from './pages/admin/LetterManager'
import CelebrationPage from './pages/CelebrationPage'
import AdminSwitch from './components/AdminSwitch'
import MusicPlayer from './components/MusicPlayer'
import './App.css'

function App() {
  return (
    <>
      <AdminSwitch />
      <MusicPlayer />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/gift/:accessCode" element={<GiftPage />} />
        <Route path="/celebrate/:name" element={<CelebrationPage />} />
        <Route path="/girls" element={<><Link to="/" className="back-button">Về trang chính</Link><Girls /></>} />
        <Route path="/boys-wish" element={<><Link to="/" className="back-button">Về trang chính</Link><BoysWish /></>} />
        <Route path="/admin/login" element={<LoginPage />} />
        <Route element={<ProtectedAdminRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="students" element={<StudentManager />} />
            <Route path="gallery" element={<GalleryManager />} />
            <Route path="letters" element={<LetterManager />} />
          </Route>
        </Route>
      </Routes>
    </>
  )
}

export default App
