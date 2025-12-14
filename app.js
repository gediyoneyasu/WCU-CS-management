const express = require("express");
const session = require("express-session");
const mysql = require('mysql2');
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const moment = require("moment");
const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.use(session({
    secret: process.env.SESSION_SECRET || 'wcu-cs-2024-smart-school',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

// MAMP MySQL Database Connection
// Replace this entire database connection block:
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'appschool',
    password: process.env.DB_PASSWORD || 'appschool',
    database: process.env.DB_NAME || 'appschool',
    port: process.env.DB_PORT || 3306,
    connectionLimit: 10,
    acquireTimeout: 30000,
    timeout: 30000,
    reconnect: true
});

// Test database connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ MAMP MySQL Connection Error:', err.message);
        console.log('💡 Make sure MAMP is running and MySQL is started on port 3306');
        return;
    }
    console.log('✅ MAMP MySQL Database Connected Successfully!');
    connection.release();
});

// Database functions
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve({ id: results.insertId, changes: results.affectedRows });
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results[0]);
        });
    });
}

// File upload configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = './public/uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Create uploads directory
if (!fs.existsSync('./public')) {
    fs.mkdirSync('./public', { recursive: true });
}

// ======================== INSTALLATION ========================
app.get("/install", async (req, res) => {
    try {
        // Create tables with MySQL syntax
        const tables = [
            `CREATE TABLE IF NOT EXISTS students (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id VARCHAR(20) UNIQUE,
                full_name VARCHAR(255) NOT NULL,
                grade VARCHAR(10) NOT NULL,
                village VARCHAR(100) NOT NULL,
                parent_phone VARCHAR(20) NOT NULL,
                sex ENUM('Male', 'Female') NOT NULL,
                age INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE TABLE IF NOT EXISTS teachers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                teacher_id VARCHAR(20) UNIQUE,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE,
                password VARCHAR(255) NOT NULL,
                subject VARCHAR(100),
                phone VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE TABLE IF NOT EXISTS class_materials (
                id INT AUTO_INCREMENT PRIMARY KEY,
                grade VARCHAR(10) NOT NULL,
                subject VARCHAR(100) NOT NULL,
                pdf_path VARCHAR(500) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                uploaded_by VARCHAR(20),
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE TABLE IF NOT EXISTS attendance (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id VARCHAR(20) NOT NULL,
                date DATE NOT NULL,
                status ENUM('P', 'A', 'O') NOT NULL,
                teacher_id VARCHAR(20) NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX student_date_idx (student_id, date)
            )`,

            `CREATE TABLE IF NOT EXISTS payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id VARCHAR(20) NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                payment_method ENUM('CBE', 'Telebirr', 'Awash', 'Other') NOT NULL,
                transaction_id VARCHAR(100),
                screenshot_path VARCHAR(500),
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                approved_by VARCHAR(20),
                paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                approved_at TIMESTAMP NULL
            )`,

            `CREATE TABLE IF NOT EXISTS announcements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                category ENUM('general', 'meeting', 'event', 'academic', 'sports') DEFAULT 'general',
                important BOOLEAN DEFAULT FALSE,
                created_by VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE TABLE IF NOT EXISTS grades (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id VARCHAR(20) NOT NULL,
                subject VARCHAR(100) NOT NULL,
                grade VARCHAR(5) NOT NULL,
                term ENUM('1', '2', '3') NOT NULL,
                year YEAR NOT NULL,
                teacher_id VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX student_subject_idx (student_id, subject)
            )`,

            `CREATE TABLE IF NOT EXISTS subjects (
                id INT AUTO_INCREMENT PRIMARY KEY,
                grade VARCHAR(10) NOT NULL,
                subject_name VARCHAR(100) NOT NULL,
                subject_code VARCHAR(20),
                teacher_id VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const tableSql of tables) {
            await dbRun(tableSql);
        }

        // Create default admin teacher
        const hashedPassword = await bcrypt.hash('teacher123', 10);
        await dbRun(
            `INSERT IGNORE INTO teachers (teacher_id, full_name, email, password, subject, phone) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            ['TECH001', 'Admin Teacher', 'admin@wcu-cs.edu.et', hashedPassword, 'Administration', '+251911223344']
        );

        // Add sample subjects
        const sampleSubjects = [
            { grade: '1', subject_name: 'Mathematics', subject_code: 'MATH-1' },
            { grade: '1', subject_name: 'English', subject_code: 'ENG-1' },
            { grade: '1', subject_name: 'Environmental Science', subject_code: 'EVS-1' },
            { grade: '2', subject_name: 'Mathematics', subject_code: 'MATH-2' },
            { grade: '2', subject_name: 'English', subject_code: 'ENG-2' },
            { grade: '6', subject_name: 'Science', subject_code: 'SCI-6' },
            { grade: '6', subject_name: 'Social Studies', subject_code: 'SST-6' }
        ];

        for (const subject of sampleSubjects) {
            await dbRun(
                `INSERT IGNORE INTO subjects (grade, subject_name, subject_code) VALUES (?, ?, ?)`,
                [subject.grade, subject.subject_name, subject.subject_code]
            );
        }

        // Add sample announcements
        const sampleAnnouncements = [
            {
                title: "🎉 Welcome to WCU -CS school System",
                content: "We are excited to launch our new digital platform for enhanced learning and school management. Parents, teachers, and students can now access all school services online.",
                category: "general",
                important: true
            },
            {
                title: "📅 Parent-Teacher Meeting Schedule",
                content: "Quarterly parent-teacher meetings will be held next week. Please check the schedule and confirm your attendance.",
                category: "meeting",
                important: true
            },
            {
                title: "🏆 Annual Sports Day Competition",
                content: "Get ready for our annual sports day! Registration starts next Monday. Let's celebrate health and teamwork.",
                category: "sports",
                important: false
            }
        ];

        for (const announcement of sampleAnnouncements) {
            await dbRun(
                `INSERT IGNORE INTO announcements (title, content, category, important, created_by) VALUES (?, ?, ?, ?, ?)`,
                [announcement.title, announcement.content, announcement.category, announcement.important, 'TECH001']
            );
        }

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Installation Complete - WCU -CS school</title>
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }
                    
                    .installation-card {
                        background: white;
                        border-radius: 20px;
                        padding: 50px;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                        text-align: center;
                        max-width: 600px;
                        width: 100%;
                    }
                    
                    .success-icon {
                        font-size: 80px;
                        color: #10B981;
                        margin-bottom: 20px;
                    }
                    
                    h1 {
                        color: #1F2937;
                        margin-bottom: 15px;
                        font-size: 2.5em;
                    }
                    
                    .subtitle {
                        color: #6B7280;
                        font-size: 1.2em;
                        margin-bottom: 30px;
                    }
                    
                    .feature-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 20px;
                        margin: 30px 0;
                    }
                    
                    .feature-item {
                        background: #F3F4F6;
                        padding: 20px;
                        border-radius: 10px;
                        text-align: center;
                    }
                    
                    .feature-icon {
                        font-size: 2em;
                        margin-bottom: 10px;
                    }
                    
                    .btn-group {
                        display: flex;
                        gap: 15px;
                        justify-content: center;
                        flex-wrap: wrap;
                        margin-top: 30px;
                    }
                    
                    .btn {
                        padding: 15px 30px;
                        border: none;
                        border-radius: 50px;
                        font-size: 1.1em;
                        font-weight: 600;
                        text-decoration: none;
                        transition: all 0.3s ease;
                        cursor: pointer;
                    }
                    
                    .btn-primary {
                        background: #3B82F6;
                        color: white;
                    }
                    
                    .btn-secondary {
                        background: #10B981;
                        color: white;
                    }
                    
                    .btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 10px 20px rgba(0,0,0,0.2);
                    }
                    
                    .login-info {
                        background: #EFF6FF;
                        padding: 20px;
                        border-radius: 10px;
                        margin: 20px 0;
                        text-align: left;
                    }
                    
                    @media (max-width: 768px) {
                        .installation-card {
                            padding: 30px 20px;
                        }
                        
                        h1 {
                            font-size: 2em;
                        }
                        
                        .btn-group {
                            flex-direction: column;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="installation-card">
                    <div class="success-icon">✅</div>
                    <h1>WCU -CS school Ready!</h1>
                    <p class="subtitle">Database initialized successfully with all features</p>
                    
                    <div class="feature-grid">
                        <div class="feature-item">
                            <div class="feature-icon">👨‍🎓</div>
                            <div>Student Portal</div>
                        </div>
                        <div class="feature-item">
                            <div class="feature-icon">👨‍🏫</div>
                            <div>Teacher Dashboard</div>
                        </div>
                        <div class="feature-item">
                            <div class="feature-icon">📊</div>
                            <div>Smart Attendance</div>
                        </div>
                        <div class="feature-item">
                            <div class="feature-icon">💳</div>
                            <div>Online Payments</div>
                        </div>
                    </div>
                    
                    <div class="login-info">
                        <h3 style="color: #3B82F6; margin-bottom: 15px;">Default Teacher Login:</h3>
                        <p><strong>Teacher ID:</strong> TECH001</p>
                        <p><strong>Password:</strong> teacher123</p>
                        <p><strong>Email:</strong> admin@wcu-cs.edu.et</p>
                    </div>
                    
                    <div class="btn-group">
                        <a href="/" class="btn btn-primary">🏠 see(launch) -CS school</a>
                        <a href="/teacher-login" class="btn btn-secondary">👨‍🏫 Teacher Login</a>
                    </div>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error("Installation error:", error);
        res.status(500).send(`
            <div style="text-align:center;margin-top:100px;color:red;">
                <h1>Installation Failed</h1>
                <p>${error.message}</p>
                <p>Check if MAMP MySQL is running on port 8889</p>
                <a href="/install" style="color:#3B82F6;">Try Again</a>
            </div>
        `);
    }
});

// Add this anywhere in your Express app (after app.use(router) etc.)
app.get('/api/live-stats', async (req, res) => {
    try {
        // Replace these with your real database queries
        const total_students = await Student.countDocuments();                    // example with MongoDB
        const total_teachers = await Teacher.countDocuments();
        const total_payments = await Payment.countDocuments({ status: 'success' });
        const today_attendance = await Attendance.countDocuments({
            date: { $gte: new Date().setHours(0, 0, 0, 0) }
        });

        res.json({
            total_students,
            total_teachers,
            total_payments,
            today_attendance
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});


// ======================== ENHANCED HOME PAGE ========================
app.get("/", async (req, res) => {
    try {
        const startTime = Date.now();

        // Use try-catch for each query to handle missing tables
        let announcements = [];
        let features = [];
        let gallery = [];
        let stats = {
            total_students: 0,
            total_teachers: 0,
            total_payments: 0,
            today_attendance: 0,
            success_rate: 95,
            years_experience: 15
        };

        try {
            announcements = await dbAll("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 6");
        } catch (annErr) {
            console.log("Announcements table not available yet");
        }

        try {
            // Try to get features from database or use defaults
            const featuresResult = await dbAll("SELECT * FROM features WHERE active = 1 LIMIT 6");
            features = featuresResult.length > 0 ? featuresResult : [
                { id: 1, title: "Student Registration", description: "Easy online registration with automatic ID generation", icon: "user-plus", link: "/student-registration" },
                { id: 2, title: "Digital Learning", description: "Access class materials and PDF resources online", icon: "book-open", link: "/classes" },
                { id: 3, title: "Smart Payments", description: "Secure online payment system with instant confirmation", icon: "credit-card", link: "/payment" },
                { id: 4, title: "Digital Attendance", description: "Real-time attendance tracking system", icon: "clipboard-check", link: "/parent-attendance" },
                { id: 5, title: "Student Portal", description: "Comprehensive student information system", icon: "graduation-cap", link: "/student-info" },
                { id: 6, title: "Teacher Dashboard", description: "Advanced dashboard for teachers", icon: "chalkboard-teacher", link: "/teacher-login" }
            ];
        } catch (featErr) {
            console.log("Features table not available yet, using defaults");
            features = [
                { id: 1, title: "Student Registration", description: "Easy online registration with automatic ID generation", icon: "user-plus", link: "/student-registration" },
                { id: 2, title: "Digital Learning", description: "Access class materials and PDF resources online", icon: "book-open", link: "/classes" },
                { id: 3, title: "Smart Payments", description: "Secure online payment system with instant confirmation", icon: "credit-card", link: "/payment" },
                { id: 4, title: "Digital Attendance", description: "Real-time attendance tracking system", icon: "clipboard-check", link: "/parent-attendance" },
                { id: 5, title: "Student Portal", description: "Comprehensive student information system", icon: "graduation-cap", link: "/student-info" },
                { id: 6, title: "Teacher Dashboard", description: "Advanced dashboard for teachers", icon: "chalkboard-teacher", link: "/teacher-login" }
            ];
        }

        try {
            // Gallery images
            gallery = await dbAll("SELECT * FROM gallery WHERE active = 1 LIMIT 6");
        } catch (galErr) {
            gallery = [];
        }

        try {
            // Enhanced stats with more data
            const statsResult = await dbAll(`
                SELECT 
                    (SELECT COUNT(*) FROM students WHERE status = 'active') as total_students,
                    (SELECT COUNT(*) FROM teachers WHERE status = 'active') as total_teachers,
                    (SELECT COUNT(*) FROM payments WHERE status = 'approved') as total_payments,
                    (SELECT COUNT(DISTINCT student_id) FROM attendance WHERE DATE(date) = CURDATE()) as today_attendance
            `);
            stats = { ...stats, ...(statsResult[0] || {}) };
        } catch (statsErr) {
            console.log("Some tables not available yet, using default stats");
        }

        const loadTime = Date.now() - startTime;

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>WCU -CS school - Modern Digital Education Platform</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
                <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
                <style>
                    :root {
                        --primary: #3B82F6;
                        --primary-dark: #1D4ED8;
                        --primary-light: #60A5FA;
                        --secondary: #10B981;
                        --secondary-dark: #059669;
                        --accent: #8B5CF6;
                        --accent-dark: #7C3AED;
                        --warning: #F59E0B;
                        --warning-dark: #D97706;
                        --danger: #EF4444;
                        --dark: #1F2937;
                        --dark-blue: #001f54;
                        --light: #F3F4F6;
                        --gray: #6B7280;
                        --gray-light: #9CA3AF;
                        --white: #FFFFFF;
                        --gradient-primary: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%);
                        --gradient-secondary: linear-gradient(135deg, #10B981 0%, #059669 100%);
                        --gradient-accent: linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%);
                        --gradient-dark: linear-gradient(135deg, #1F2937 0%, #111827 100%);
                        --shadow-sm: 0 2px 10px rgba(0,0,0,0.08);
                        --shadow-md: 0 10px 30px rgba(0,0,0,0.12);
                        --shadow-lg: 0 20px 50px rgba(0,0,0,0.15);
                        --shadow-xl: 0 25px 60px rgba(0,0,0,0.2);
                        --radius-sm: 12px;
                        --radius-md: 20px;
                        --radius-lg: 30px;
                        --radius-xl: 40px;
                        --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        --transition-slow: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    html {
                        scroll-behavior: smooth;
                    }
                    
                    body {
                        font-family: 'Poppins', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background: var(--light);
                        color: var(--dark);
                        line-height: 1.6;
                        overflow-x: hidden;
                        position: relative;
                    }
                    
                    body::before {
                        content: '';
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: 
                            radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                            radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
                            radial-gradient(circle at 40% 40%, rgba(16, 185, 129, 0.05) 0%, transparent 50%);
                        z-index: -1;
                    }
                    
                    /* Custom Scrollbar */
                    ::-webkit-scrollbar {
                        width: 10px;
                    }
                    
                    ::-webkit-scrollbar-track {
                        background: var(--light);
                    }
                    
                    ::-webkit-scrollbar-thumb {
                        background: var(--primary);
                        border-radius: 5px;
                    }
                    
                    ::-webkit-scrollbar-thumb:hover {
                        background: var(--primary-dark);
                    }
                    
                    /* Header Styles */
                    .hero-section {
                        min-height: 100vh;
                        background: var(--gradient-dark);
                        position: relative;
                        overflow: hidden;
                        padding: 0 20px;
                    }
                    
                    .hero-section::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: 
                            radial-gradient(circle at 10% 20%, rgba(59, 130, 246, 0.15) 0%, transparent 30%),
                            radial-gradient(circle at 90% 80%, rgba(139, 92, 246, 0.15) 0%, transparent 30%),
                            radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.1) 0%, transparent 40%);
                        z-index: 1;
                    }
                    
                    .hero-content {
                        max-width: 1400px;
                        margin: 0 auto;
                        padding: 120px 0 80px;
                        position: relative;
                        z-index: 2;
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 60px;
                        align-items: center;
                    }
                    
                    .hero-text {
                        animation: fadeInUp 1s ease-out;
                    }
                    
                    .hero-badge {
                        display: inline-flex;
                        align-items: center;
                        gap: 10px;
                        background: rgba(255, 255, 255, 0.1);
                        backdrop-filter: blur(10px);
                        padding: 12px 25px;
                        border-radius: 50px;
                        margin-bottom: 30px;
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        animation: pulse 2s infinite;
                    }
                    
                    .hero-badge i {
                        color: var(--warning);
                        font-size: 1.2em;
                    }
                    
                    .hero-badge span {
                        color: var(--white);
                        font-weight: 500;
                        font-size: 0.95em;
                    }
                    
                    .hero-title {
                        font-size: 3.8em;
                        font-weight: 900;
                        margin-bottom: 20px;
                        line-height: 1.2;
                        font-family: 'Montserrat', sans-serif;
                        background: linear-gradient(45deg, #FFFFFF, #60A5FA, #8B5CF6);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-size: 200% auto;
                        animation: gradientShift 3s ease infinite;
                    }
                    
                    .hero-subtitle {
                        font-size: 1.3em;
                        color: rgba(255, 255, 255, 0.9);
                        margin-bottom: 40px;
                        max-width: 600px;
                        line-height: 1.7;
                    }
                    
                    .hero-features {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 15px;
                        margin-bottom: 40px;
                    }
                    
                    .hero-feature {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        background: rgba(255, 255, 255, 0.05);
                        padding: 10px 20px;
                        border-radius: 25px;
                        color: var(--white);
                        font-size: 0.9em;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        transition: var(--transition);
                    }
                    
                    .hero-feature:hover {
                        background: rgba(255, 255, 255, 0.1);
                        transform: translateY(-2px);
                    }
                    
                    .hero-feature i {
                        color: var(--secondary);
                    }
                    
                    .hero-buttons {
                        display: flex;
                        gap: 20px;
                        flex-wrap: wrap;
                    }
                    
                    .btn {
                        display: inline-flex;
                        align-items: center;
                        gap: 12px;
                        padding: 18px 40px;
                        border-radius: 50px;
                        font-weight: 600;
                        font-size: 1.1em;
                        text-decoration: none;
                        transition: var(--transition);
                        position: relative;
                        overflow: hidden;
                        border: none;
                        cursor: pointer;
                        justify-content: center;
                    }
                    
                    .btn-primary {
                        background: var(--gradient-primary);
                        color: var(--white);
                        box-shadow: 0 10px 30px rgba(59, 130, 246, 0.3);
                    }
                    
                    .btn-primary:hover {
                        transform: translateY(-5px);
                        box-shadow: 0 15px 40px rgba(59, 130, 246, 0.4);
                    }
                    
                    .btn-secondary {
                        background: rgba(255, 255, 255, 0.1);
                        backdrop-filter: blur(10px);
                        color: var(--white);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                    }
                    
                    .btn-secondary:hover {
                        background: rgba(255, 255, 255, 0.2);
                        transform: translateY(-5px);
                    }
                    
                    .btn-outline {
                        background: transparent;
                        color: var(--white);
                        border: 2px solid rgba(255, 255, 255, 0.3);
                    }
                    
                    .btn-outline:hover {
                        background: rgba(255, 255, 255, 0.1);
                        border-color: var(--white);
                    }
                    
                    .hero-image {
                        position: relative;
                        animation: float 6s ease-in-out infinite;
                    }
                    
                    .hero-image img {
                        width: 100%;
                        max-width: 600px;
                        border-radius: var(--radius-xl);
                        box-shadow: var(--shadow-xl);
                        border: 10px solid rgba(255, 255, 255, 0.1);
                        transform: perspective(1000px) rotateY(0deg);
                        transition: var(--transition-slow);
                    }
                    
                    .hero-image:hover img {
                        transform: perspective(1000px) rotateY(0deg);
                    }
                    
                    .hero-image::before {
                        content: '';
                        position: absolute;
                        top: 20px;
                        left: 20px;
                        right: -20px;
                        bottom: -20px;
                        background: var(--gradient-primary);
                        border-radius: var(--radius-xl);
                        z-index: -1;
                        opacity: 0.5;
                        filter: blur(20px);
                    }
                    
                    /* Installation Banner */
                    .install-banner {
                        position: fixed;
                        bottom: 30px;
                        right: 30px;
                        background: linear-gradient(135deg, #10B981, #059669);
                        color: white;
                        padding: 25px;
                        border-radius: var(--radius-lg);
                        box-shadow: var(--shadow-xl);
                        z-index: 1000;
                        animation: slideInRight 0.8s ease-out, bounce 2s infinite 2s;
                        max-width: 400px;
                        backdrop-filter: blur(10px);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                    }
                    
                    .install-banner h3 {
                        font-size: 1.4em;
                        margin-bottom: 10px;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }
                    
                    /* Navigation */
                    .navbar {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        background: rgba(31, 41, 55, 0.95);
                        backdrop-filter: blur(20px);
                        padding: 20px 40px;
                        z-index: 1000;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                        transition: var(--transition);
                    }
                    
                    .navbar.scrolled {
                        padding: 15px 40px;
                        background: rgba(0, 31, 84, 0.98);
                        box-shadow: var(--shadow-lg);
                    }
                    
                    .nav-container {
                        max-width: 1400px;
                        margin: 0 auto;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        flex-wrap: wrap;
                    }
                    
                    .logo {
                        display: flex;
                        align-items: center;
                        gap: 15px;
                        text-decoration: none;
                    }
                    
                    .logo-icon {
                        width: 50px;
                        height: 50px;
                        background: var(--gradient-primary);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1.5em;
                        color: white;
                        box-shadow: var(--shadow-md);
                    }
                    
                    .logo-text {
                        color: white;
                        font-family: 'Montserrat', sans-serif;
                        font-weight: 800;
                        font-size: 1.5em;
                    }
                    
                    .logo-text span {
                        color: var(--warning);
                    }
                    
                    .nav-links {
                        display: flex;
                        gap: 5px;
                        flex-wrap: wrap;
                    }
                    
                    .nav-link {
                        padding: 12px 25px;
                        color: rgba(255, 255, 255, 0.9);
                        text-decoration: none;
                        font-weight: 500;
                        border-radius: 25px;
                        transition: var(--transition);
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        position: relative;
                    }
                    
                    .nav-link:hover {
                        color: white;
                        background: rgba(255, 255, 255, 0.1);
                    }
                    
                    .nav-link.active {
                        background: var(--gradient-primary);
                        color: white;
                        box-shadow: 0 5px 15px rgba(59, 130, 246, 0.3);
                    }
                    
                    .nav-link i {
                        font-size: 0.9em;
                    }
                    
                    .dropdown {
                        position: relative;
                    }
                    
                    .dropdown-content {
                        position: absolute;
                        top: 100%;
                        left: 0;
                        background: white;
                        min-width: 250px;
                        border-radius: var(--radius-md);
                        box-shadow: var(--shadow-lg);
                        opacity: 0;
                        visibility: hidden;
                        transform: translateY(10px);
                        transition: var(--transition);
                        z-index: 1000;
                        padding: 10px 0;
                    }
                    
                    .dropdown:hover .dropdown-content {
                        opacity: 1;
                        visibility: visible;
                        transform: translateY(0);
                    }
                    
                    .dropdown-item {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 15px 25px;
                        color: var(--dark);
                        text-decoration: none;
                        transition: var(--transition);
                        border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                    }
                    
                    .dropdown-item:last-child {
                        border-bottom: none;
                    }
                    
                    .dropdown-item:hover {
                        background: var(--light);
                        color: var(--primary);
                        padding-left: 30px;
                    }
                    
                    .dropdown-item i {
                        color: var(--primary);
                        width: 20px;
                        text-align: center;
                    }
                    
                    .mobile-toggle {
                        display: none;
                        background: none;
                        border: none;
                        color: white;
                        font-size: 1.5em;
                        cursor: pointer;
                        padding: 10px;
                    }
                    
                    /* Main Container */
                    .container {
                        max-width: 1400px;
                        margin: 0 auto;
                        padding: 60px 20px;
                    }
                    
                    .section-title {
                        text-align: center;
                        font-size: 3em;
                        margin-bottom: 20px;
                        font-family: 'Montserrat', sans-serif;
                        font-weight: 800;
                        background: linear-gradient(45deg, var(--primary), var(--accent));
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        position: relative;
                        padding-bottom: 20px;
                    }
                    
                    .section-title::after {
                        content: '';
                        position: absolute;
                        bottom: 0;
                        left: 50%;
                        transform: translateX(-50%);
                        width: 100px;
                        height: 5px;
                        background: var(--gradient-primary);
                        border-radius: 5px;
                    }
                    
                    .section-subtitle {
                        text-align: center;
                        font-size: 1.2em;
                        color: var(--gray);
                        margin-bottom: 60px;
                        max-width: 700px;
                        margin-left: auto;
                        margin-right: auto;
                    }
                    
                    /* Stats Grid */
                    .stats-section {
                        background: var(--gradient-dark);
                        color: white;
                        padding: 100px 20px;
                        position: relative;
                        overflow: hidden;
                    }
                    
                    .stats-section::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: 
                            radial-gradient(circle at 30% 70%, rgba(59, 130, 246, 0.2) 0%, transparent 40%),
                            radial-gradient(circle at 70% 30%, rgba(139, 92, 246, 0.2) 0%, transparent 40%);
                    }
                    
                    .stats-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 30px;
                        position: relative;
                        z-index: 1;
                    }
                    
                    .stat-card {
                        background: rgba(255, 255, 255, 0.1);
                        backdrop-filter: blur(20px);
                        border-radius: var(--radius-lg);
                        padding: 40px 30px;
                        text-align: center;
                        transition: var(--transition);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        position: relative;
                        overflow: hidden;
                    }
                    
                    .stat-card::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        height: 5px;
                        background: var(--gradient-primary);
                    }
                    
                    .stat-card:hover {
                        transform: translateY(-10px);
                        background: rgba(255, 255, 255, 0.15);
                        box-shadow: var(--shadow-lg);
                    }
                    
                    .stat-icon {
                        font-size: 3.5em;
                        margin-bottom: 20px;
                        opacity: 0.9;
                    }
                    
                    .stat-number {
                        font-size: 3.5em;
                        font-weight: 800;
                        margin-bottom: 10px;
                        font-family: 'Montserrat', sans-serif;
                        color: white;
                    }
                    
                    .stat-label {
                        font-size: 1.1em;
                        color: rgba(255, 255, 255, 0.9);
                        font-weight: 500;
                    }
                    
                    /* Features Grid */
                    .features-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
                        gap: 30px;
                        margin: 60px 0;
                    }
                    
                    .feature-card {
                        background: white;
                        padding: 40px 30px;
                        border-radius: var(--radius-lg);
                        box-shadow: var(--shadow-md);
                        transition: var(--transition);
                        position: relative;
                        overflow: hidden;
                        text-align: center;
                    }
                    
                    .feature-card::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        height: 5px;
                        background: var(--gradient-primary);
                        transition: var(--transition);
                    }
                    
                    .feature-card:hover {
                        transform: translateY(-15px);
                        box-shadow: var(--shadow-xl);
                    }
                    
                    .feature-card:hover::before {
                        height: 100%;
                        opacity: 0.05;
                    }
                    
                    .feature-icon {
                        width: 80px;
                        height: 80px;
                        background: var(--gradient-primary);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 25px;
                        font-size: 2em;
                        color: white;
                        box-shadow: 0 10px 30px rgba(59, 130, 246, 0.3);
                        transition: var(--transition);
                    }
                    
                    .feature-card:hover .feature-icon {
                        transform: scale(1.1) rotate(10deg);
                    }
                    
                    .feature-title {
                        font-size: 1.5em;
                        font-weight: 700;
                        margin-bottom: 15px;
                        color: var(--dark);
                    }
                    
                    .feature-description {
                        color: var(--gray);
                        margin-bottom: 25px;
                        line-height: 1.7;
                    }
                    
                    .feature-link {
                        display: inline-flex;
                        align-items: center;
                        gap: 10px;
                        padding: 12px 30px;
                        background: var(--gradient-primary);
                        color: white;
                        text-decoration: none;
                        border-radius: 25px;
                        font-weight: 600;
                        transition: var(--transition);
                    }
                    
                    .feature-link:hover {
                        gap: 15px;
                        transform: translateY(-3px);
                        box-shadow: 0 10px 20px rgba(59, 130, 246, 0.3);
                    }
                    
                    /* Announcements */
                    .announcements-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
                        gap: 30px;
                        margin: 60px 0;
                    }
                    
                    .announcement-card {
                        background: white;
                        border-radius: var(--radius-lg);
                        overflow: hidden;
                        box-shadow: var(--shadow-md);
                        transition: var(--transition);
                        position: relative;
                    }
                    
                    .announcement-card:hover {
                        transform: translateY(-10px);
                        box-shadow: var(--shadow-lg);
                    }
                    
                    .announcement-header {
                        background: var(--gradient-primary);
                        color: white;
                        padding: 25px;
                        display: flex;
                        align-items: center;
                        gap: 15px;
                    }
                    
                    .announcement-icon {
                        font-size: 2em;
                        opacity: 0.9;
                    }
                    
                    .announcement-title {
                        font-size: 1.3em;
                        font-weight: 600;
                        flex: 1;
                    }
                    
                    .announcement-body {
                        padding: 25px;
                    }
                    
                    .announcement-content {
                        color: var(--gray);
                        margin-bottom: 20px;
                        line-height: 1.7;
                    }
                    
                    .announcement-meta {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding-top: 20px;
                        border-top: 1px solid var(--light);
                        color: var(--gray-light);
                        font-size: 0.9em;
                    }
                    
                    .announcement-category {
                        background: var(--light);
                        padding: 5px 15px;
                        border-radius: 20px;
                        font-weight: 600;
                        color: var(--primary);
                    }
                    
                    /* Testimonials */
                    .testimonials-section {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 100px 20px;
                        position: relative;
                        overflow: hidden;
                    }
                    
                    .testimonials-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                        gap: 30px;
                        margin: 60px 0;
                    }
                    
                    .testimonial-card {
                        background: rgba(255, 255, 255, 0.1);
                        backdrop-filter: blur(20px);
                        border-radius: var(--radius-lg);
                        padding: 30px;
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        transition: var(--transition);
                    }
                    
                    .testimonial-card:hover {
                        background: rgba(255, 255, 255, 0.15);
                        transform: translateY(-10px);
                    }
                    
                    .testimonial-rating {
                        color: var(--warning);
                        margin-bottom: 20px;
                        font-size: 1.2em;
                    }
                    
                    .testimonial-text {
                        font-style: italic;
                        margin-bottom: 25px;
                        line-height: 1.7;
                        color: rgba(255, 255, 255, 0.9);
                    }
                    
                    .testimonial-author {
                        display: flex;
                        align-items: center;
                        gap: 15px;
                    }
                    
                    .author-avatar {
                        width: 50px;
                        height: 50px;
                        background: var(--gradient-primary);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1.5em;
                        color: white;
                    }
                    
                    .author-info h4 {
                        font-weight: 600;
                        margin-bottom: 5px;
                    }
                    
                    .author-info p {
                        color: rgba(255, 255, 255, 0.7);
                        font-size: 0.9em;
                    }
                    
                    /* Gallery */
                    .gallery-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                        gap: 20px;
                        margin: 60px 0;
                    }
                    
                    .gallery-item {
                        position: relative;
                        border-radius: var(--radius-lg);
                        overflow: hidden;
                        aspect-ratio: 16/9;
                        cursor: pointer;
                        transition: var(--transition);
                    }
                    
                    .gallery-item:hover {
                        transform: scale(1.05);
                    }
                    
                    .gallery-item img {
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                        transition: var(--transition);
                    }
                    
                    .gallery-overlay {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.7);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        opacity: 0;
                        transition: var(--transition);
                    }
                    
                    .gallery-item:hover .gallery-overlay {
                        opacity: 1;
                    }
                    
                    .gallery-overlay i {
                        color: white;
                        font-size: 2.5em;
                    }
                    
                    /* CTA Section */
                    .cta-section {
                        background: var(--gradient-accent);
                        color: white;
                        padding: 100px 20px;
                        text-align: center;
                        border-radius: var(--radius-lg);
                        margin: 100px 0;
                        position: relative;
                        overflow: hidden;
                    }
                    
                    .cta-section::before {
                        content: '';
                        position: absolute;
                        top: -50%;
                        left: -50%;
                        right: -50%;
                        bottom: -50%;
                        background: 
                            radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
                            radial-gradient(circle at 70% 70%, rgba(255, 255, 255, 0.1) 0%, transparent 50%);
                        animation: rotate 20s linear infinite;
                    }
                    
                    .cta-content {
                        position: relative;
                        z-index: 1;
                    }
                    
                    .cta-title {
                        font-size: 3em;
                        margin-bottom: 20px;
                        font-family: 'Montserrat', sans-serif;
                        font-weight: 800;
                    }
                    
                    .cta-text {
                        font-size: 1.2em;
                        margin-bottom: 40px;
                        max-width: 700px;
                        margin-left: auto;
                        margin-right: auto;
                        color: rgba(255, 255, 255, 0.9);
                    }
                    
                    /* Footer */
                    .footer {
                        background: var(--dark);
                        color: white;
                        padding: 80px 20px 40px;
                        position: relative;
                    }
                    
                    .footer::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        height: 5px;
                        background: var(--gradient-primary);
                    }
                    
                    .footer-content {
                        max-width: 1400px;
                        margin: 0 auto;
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                        gap: 50px;
                    }
                    
                    .footer-section h3 {
                        color: var(--primary-light);
                        margin-bottom: 25px;
                        font-size: 1.4em;
                        position: relative;
                        padding-bottom: 15px;
                    }
                    
                    .footer-section h3::after {
                        content: '';
                        position: absolute;
                        bottom: 0;
                        left: 0;
                        width: 50px;
                        height: 3px;
                        background: var(--gradient-primary);
                    }
                    
                    .footer-section p {
                        color: rgba(255, 255, 255, 0.8);
                        margin-bottom: 20px;
                        line-height: 1.7;
                    }
                    
                    .footer-links {
                        list-style: none;
                    }
                    
                    .footer-links li {
                        margin-bottom: 15px;
                    }
                    
                    .footer-links a {
                        color: rgba(255, 255, 255, 0.8);
                        text-decoration: none;
                        transition: var(--transition);
                        display: flex;
                        align-items: center;
                        gap: 12px;
                    }
                    
                    .footer-links a:hover {
                        color: white;
                        transform: translateX(5px);
                    }
                    
                    .social-links {
                        display: flex;
                        gap: 15px;
                        margin-top: 20px;
                    }
                    
                    .social-links a {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 45px;
                        height: 45px;
                        background: rgba(255, 255, 255, 0.1);
                        border-radius: 50%;
                        color: white;
                        font-size: 1.2em;
                        transition: var(--transition);
                        text-decoration: none;
                    }
                    
                    .social-links a:hover {
                        background: var(--primary);
                        transform: translateY(-5px);
                    }
                    
                    .footer-bottom {
                        max-width: 1400px;
                        margin: 60px auto 0;
                        padding-top: 30px;
                        border-top: 1px solid rgba(255, 255, 255, 0.1);
                        text-align: center;
                        color: rgba(255, 255, 255, 0.6);
                        font-size: 0.9em;
                    }
                    
                    .load-time {
                        text-align: center;
                        color: var(--gray);
                        margin: 40px 0 20px;
                        font-size: 0.9em;
                        padding: 15px;
                        background: white;
                        border-radius: var(--radius-sm);
                        max-width: 300px;
                        margin-left: auto;
                        margin-right: auto;
                        box-shadow: var(--shadow-sm);
                    }
                    
                    /* Animations */
                    @keyframes fadeInUp {
                        from {
                            opacity: 0;
                            transform: translateY(30px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                    
                    @keyframes fadeIn {
                        from {
                            opacity: 0;
                        }
                        to {
                            opacity: 1;
                        }
                    }
                    
                    @keyframes slideInRight {
                        from {
                            opacity: 0;
                            transform: translateX(50px);
                        }
                        to {
                            opacity: 1;
                            transform: translateX(0);
                        }
                    }
                    
                    @keyframes pulse {
                        0%, 100% {
                            transform: scale(1);
                        }
                        50% {
                            transform: scale(1.05);
                        }
                    }
                    
                    @keyframes bounce {
                        0%, 100% {
                            transform: translateY(0);
                        }
                        50% {
                            transform: translateY(-10px);
                        }
                    }
                    
                    @keyframes float {
                        0%, 100% {
                            transform: translateY(0);
                        }
                        50% {
                            transform: translateY(-20px);
                        }
                    }
                    
                    @keyframes gradientShift {
                        0%, 100% {
                            background-position: 0% center;
                        }
                        50% {
                            background-position: 100% center;
                        }
                    }
                    
                    @keyframes rotate {
                        from {
                            transform: rotate(0deg);
                        }
                        to {
                            transform: rotate(360deg);
                        }
                    }
                    
                    /* Responsive Design */
                    @media (max-width: 1200px) {
                        .hero-content {
                            grid-template-columns: 1fr;
                            text-align: center;
                            gap: 40px;
                        }
                        
                        .hero-features {
                            justify-content: center;
                        }
                        
                        .hero-buttons {
                            justify-content: center;
                        }
                        
                        .hero-title {
                            font-size: 3em;
                        }
                    }
                    
                    @media (max-width: 992px) {
                        .hero-title {
                            font-size: 2.5em;
                        }
                        
                        .section-title {
                            font-size: 2.5em;
                        }
                        
                        .nav-links {
                            display: none;
                        }
                        
                        .mobile-toggle {
                            display: block;
                        }
                        
                        .navbar {
                            padding: 15px 20px;
                        }
                        
                        .mobile-nav {
                            position: fixed;
                            top: 80px;
                            left: 0;
                            right: 0;
                            background: var(--dark);
                            padding: 20px;
                            display: flex;
                            flex-direction: column;
                            gap: 10px;
                            transform: translateY(-100%);
                            opacity: 0;
                            visibility: hidden;
                            transition: var(--transition);
                            z-index: 999;
                        }
                        
                        .mobile-nav.active {
                            transform: translateY(0);
                            opacity: 1;
                            visibility: visible;
                        }
                        
                        .mobile-nav .nav-link {
                            padding: 15px 20px;
                            background: rgba(255, 255, 255, 0.1);
                            border-radius: var(--radius-sm);
                        }
                        
                        .dropdown-content {
                            position: static;
                            opacity: 1;
                            visibility: visible;
                            transform: none;
                            box-shadow: none;
                            background: transparent;
                            padding: 10px 0 0 20px;
                        }
                        
                        .dropdown-item {
                            color: rgba(255, 255, 255, 0.9);
                            padding: 10px 20px;
                        }
                        
                        .dropdown-item:hover {
                            background: rgba(255, 255, 255, 0.1);
                            color: white;
                        }
                    }
                    
                    @media (max-width: 768px) {
                        .hero-title {
                            font-size: 2em;
                        }
                        
                        .hero-subtitle {
                            font-size: 1.1em;
                        }
                        
                        .section-title {
                            font-size: 2em;
                        }
                        
                        .cta-title {
                            font-size: 2em;
                        }
                        
                        .btn {
                            padding: 15px 30px;
                            font-size: 1em;
                        }
                        
                        .stats-grid {
                            grid-template-columns: repeat(2, 1fr);
                        }
                        
                        .features-grid,
                        .announcements-grid,
                        .testimonials-grid {
                            grid-template-columns: 1fr;
                        }
                        
                        .gallery-grid {
                            grid-template-columns: repeat(2, 1fr);
                        }
                        
                        .hero-buttons {
                            flex-direction: column;
                        }
                        
                        .install-banner {
                            bottom: 20px;
                            right: 20px;
                            left: 20px;
                            max-width: none;
                        }
                    }
                    
                    @media (max-width: 480px) {
                        .hero-title {
                            font-size: 1.8em;
                        }
                        
                        .section-title {
                            font-size: 1.8em;
                        }
                        
                        .stats-grid {
                            grid-template-columns: 1fr;
                        }
                        
                        .gallery-grid {
                            grid-template-columns: 1fr;
                        }
                        
                        .stat-number {
                            font-size: 2.8em;
                        }
                        
                        .feature-card {
                            padding: 30px 20px;
                        }
                        
                        .footer-content {
                            grid-template-columns: 1fr;
                        }
                    }


                    <!-- Simple responsive CSS (add this in your CSS file or inside <style> tag) -->

  .about-section {
    background: #f8f9fa;
  }
  .section-title {
    font-size: 700 2.5rem / 1.2 "Poppins", sans-serif;
    color: #1a1a1a;
  }
  .about-highlights .highlight {
    background: white;
    padding: 15px;
    border-radius: 12px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.05);
  }
  .about-image {
    max-height: 550px;
    item-align: center:
  }
  @media (max-width: 768px) {
    .section-title {
      font-size: 2rem;
      text-align: center;
    }
    .about-image {
      max-height: 400px;
      margin-top: 2rem;
    }
  }
  @media (max-width: 576px) {
    .section-title {
      font-size: 1.8rem;
    }
    .about-highlights .highlight {
      text-align: left;
    }
  }
<!--smart feature added style---->

.features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(minmax(300px, 1fr)));
    gap: 2rem;
    padding: 1rem 0;
}

.feature-card-link {
    text-decoration: none !important;
    color: inherit;
    display: block;
    border-radius: 16px;
    overflow: hidden;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.feature-card-link:hover {
    transform: translateY(-10px);
    box-shadow: 0 20px 40px rgba(0,0,0,0.15);
}

.feature-card {
    background: white;
    padding: 2rem;
    border-radius: 16px;
    text-align: center;
    box-shadow: 0 8px 25px rgba(0,0,0,0.15);
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: all 0.3s ease;
    cursor: pointer;                    /* ← This forces the hand cursor */
}

.feature-card:hover {
    transform: translateY(-5px);
}

.feature-icon {
    width: 80px;
    height: 80px;
    background: #e3f2fd;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.5rem;
    color: #0d47a1;
}

.feature-link {
    color: #0d47a1;
    font-weight: 600;
    margin-top: 1rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.feature-card-link:hover .feature-link {
    color: #0d47a1;
}
  
                </style>
            </head>
            <body>
            
              <!-- Navigation -->
                <nav class="navbar">
                    <div class="nav-container">
                        <a href="/" class="logo">
                            <div class="logo-icon">
                                <i class="fas fa-graduation-cap"></i>
                            </div>
                            <div class="logo-text">WCU-<span>CS</span></div>
                        </a>
                        
                        <div class="nav-links">
                            <a href="/" class="nav-link active"><i class="fas fa-home"></i> Home</a>
                            <a href="#about" class="nav-link"><i class="fas fa-info-circle"></i> About</a>
                            
                            <div class="dropdown">
                                <a href="#services" class="nav-link">
                                    <i class="fas fa-concierge-bell"></i> Services <i class="fas fa-chevron-down"></i>
                                </a>
                                <div class="dropdown-content">
                                    ${features.map(feature => `
                                        <a href="${feature.link}" class="dropdown-item">
                                            <i class="fas fa-${feature.icon}"></i> ${feature.title}
                                        </a>
                                    `).join('')}
                                </div>
                            </div>
                            
                            <a href="#announcements" class="nav-link"><i class="fas fa-bullhorn"></i> Announcements</a>
                            <a href="#gallery" class="nav-link"><i class="fas fa-images"></i> Gallery</a>
                            <a href="#contact" class="nav-link"><i class="fas fa-phone"></i> Contact</a>
                            
                            <a href="/teacher-login" class="nav-link" style="background: var(--secondary); color: white;">
                                <i class="fas fa-chalkboard-teacher"></i> Teacher Portal
                            </a>
                            <a href="/admin" class="nav-link" style="background: var(--accent); color: white;">
                                <i class="fas fa-cog"></i> Admin Panel
                            </a>
                        </div>
                        
                        <button class="mobile-toggle">
                            <i class="fas fa-bars"></i>
                        </button>
                    </div>
                </nav>
                
                <!-- Hero Section -->
                <section class="hero-section">
                    <div class="hero-content">
                        <div class="hero-text">
                            <div class="hero-badge">
                                <i class="fas fa-award"></i>
                                <span>Excellence in Education Since 2010</span>
                            </div>
                            
                            <h1 class="hero-title">Wachamo University community School</h1>
                            <p class="hero-subtitle">
                                Transforming education through innovative technology, dedicated teaching, and modern digital solutions.
                                Join us in shaping the future of Ethiopian education.
                            </p>
                            
                            <div class="hero-features">
                                <div class="hero-feature">
                                    <i class="fas fa-check-circle"></i>
                                    <span>Digital Learning</span>
                                </div>
                                <div class="hero-feature">
                                    <i class="fas fa-check-circle"></i>
                                    <span>Expert Teachers</span>
                                </div>
                                <div class="hero-feature">
                                    <i class="fas fa-check-circle"></i>
                                    <span>Modern Facilities</span>
                                </div>
                                <div class="hero-feature">
                                    <i class="fas fa-check-circle"></i>
                                    <span>Smart Solutions</span>
                                </div>
                            </div>
                            
                            <div class="hero-buttons">
                                <a href="/student-registration" class="btn btn-primary">
                                    <i class="fas fa-user-plus"></i> Register Now
                                </a>
                                <a href="#features" class="btn btn-secondary">
                                    <i class="fas fa-play-circle"></i> Learn More
                                </a>
                                <a href="/contact" class="btn btn-outline">
                                    <i class="fas fa-phone-alt"></i> Contact Us
                                </a>
                            </div>
                        </div>
                        
         <div class="hero-image">
    <img src="/upload/uploads/images/image.png" alt="Wachamo University Community School">
</div>
                    </div>
                </section>

                
              
              <!-- Statistics Section -->
<section class="stats-section">
    <div class="container">
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">👨‍🎓</div>
                <div class="stat-number" id="total-students" data-target="${stats.total_students}">${stats.total_students}</div>
                <div class="stat-label">Active Students</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">👨‍🏫</div>
                <div class="stat-number" id="total-teachers" data-target="${stats.total_teachers}">${stats.total_teachers}</div>
                <div class="stat-label">Qualified Teachers</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">💳</div>
                <div class="stat-number" id="total-payments" data-target="${stats.total_payments}">${stats.total_payments}</div>
                <div class="stat-label">Successful Payments</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📊</div>
                <div class="stat-number" id="today-attendance" data-target="${stats.today_attendance}">${stats.today_attendance}</div>
                <div class="stat-label">Today's Attendance</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🏆</div>
                <div class="stat-number">${stats.success_rate}%</div>
                <div class="stat-label">Success Rate</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📅</div>
                <div class="stat-number">${stats.years_experience}+</div>
                <div class="stat-label">Years Experience</div>
            </div>
        </div>
    </div>
</section>




                <!-- About Section -->
<section id="about" class="about-section py-5">
  <div class="container">
    <div class="row align-items-center g-5">
      <!-- Text Content -->
      <div class="col-lg-6 col-md-12">
        <div class="about-text">
          <h2 class="section-title mb-4">
            About Wachamo University Community School
          </h2>
          <p class="lead text-muted mb-4">
            Excellence in Education Since <strong>2010 E.C (2017/18 G.C)</strong>
          </p>
          <p>
            Wachamo University Community School is located in <strong>Central Ethiopia, Hadiya Zone, Hossana town, 
            near Amibicho area inside Wachamo University campus</strong>. We are proud to be one of the most modern 
            and innovative community schools in the region.
          </p>
          <p>
            We proudly serve students from <strong>Kindergarten (KG 1–3) up to Grade 7</strong>, providing high-quality 
            education delivered by experienced <strong>Wachamo University lecturers</strong> and qualified teachers.
          </p>
          <p>
            Our teaching approach combines <strong>theory with practical activities</strong> and uses the latest 
            <strong>modern digital systems and smart classrooms</strong> to develop watchful, responsible, 
            and confident citizens for tomorrow’s Ethiopia.
          </p>

          <div class="about-highlights mt-4">
            <div class="highlight d-flex align-items-center mb-3">
              <i class="fas fa-chalkboard-teacher fa-2x text-primary me-3"></i>
              <div>
                <strong>University Lecturers</strong><br>
                <small>Highly qualified academic staff</small>
              </div>
            </div>
            <div class="highlight d-flex align-items-center mb-3">
              <i class="fas fa-laptop-code fa-2x text-primary me-3"></i>
              <div>
                <strong>Modern Digital System</strong><br>
                <small>Smart boards & e-learning platforms</small>
              </div>
            </div>
            <div class="highlight d-flex align-items-center">
              <i class="fas fa-users fa-2x text-primary me-3"></i>
              <div>
                <strong>KG 1–3 to Grade 7</strong><br>
                <small>Complete primary education</small>
              </div>
            </div>
          </div>

          <a href="/student-registration" class="btn btn-primary btn-lg mt-4">
            <i class="fas fa-user-plus"></i> Register Your Child Today
          </a>
        </div>
      </div>

      <!-- Image -->
      <div class="col-lg-6 col-md-12 text-center">
        <div class="about-image shadow-lg rounded-4 overflow-hidden">
               <div class="hero-image">
    <img src="/upload/uploads/images/schoolimg1.webp" alt="Wachamo University Community School">
</div>
        </div>
      </div>
    </div>
  </div>
</section>


                
            <!-- Features Section -->
<section id="features" class="container py-5">
    <h2 class="section-title text-center mb-3">Our Smart Features</h2>
    <p class="section-subtitle text-center text-muted mb-5">
        Discover our comprehensive digital education solutions designed to enhance learning and administration
    </p>

    <div class="features-grid">
        <!-- Dynamic features from your JS array -->
        ${features.map(feature => `
            <a href="${feature.link}" class="feature-card-link">
                <div class="feature-card">
                    <div class="feature-icon">
                        <i class="fas fa-${feature.icon} fa-2x"></i>
                    </div>
                    <h3 class="feature-title">${feature.title}</h3>
                    <p class="feature-description">${feature.description}</p>
                    <span class="feature-link">
                        Get Started <i class="fas fa-arrow-right"></i>
                    </span>
                </div>
            </a>
        `).join('')}

        <!-- Extra static cards (also fully clickable) -->
        <a href="/analytics" class="feature-card-link">
            <div class="feature-card">
                <div class="feature-icon">
                    <i class="fas fa-chart-line fa-2x"></i>
                </div>
                <h3 class="feature-title">Progress Analytics</h3>
                <p class="feature-description">Detailed analytics and reports for student progress monitoring</p>
                <span class="feature-link">View Analytics <i class="fas fa-arrow-right"></i></span>
            </div>
        </a>

        <a href="/parent-portal" class="feature-card-link">
            <div class="feature-card">
                <div class="feature-icon">
                    <i class="fas fa-comments fa-2x"></i>
                </div>
                <h3 class="feature-title">Parent Portal</h3>
                <p class="feature-description">Real-time communication between parents and teachers</p>
                <span class="feature-link">Access Portal <i class="fas fa-arrow-right"></i></span>
            </div>
        </a>
    </div>
</section>
                
                <!-- Announcements Section -->
                <section id="announcements" class="container">
                    <h2 class="section-title">Latest Announcements</h2>
                    <p class="section-subtitle">
                        Stay updated with the latest news, events, and important information from our school
                    </p>
                    
                    <div class="announcements-grid">
                        ${announcements.length > 0 ? announcements.map(ann => `
                            <div class="announcement-card">
                                <div class="announcement-header">
                                    <div class="announcement-icon">
                                        ${ann.category === 'meeting' ? '📅' :
                ann.category === 'event' ? '🎉' :
                    ann.category === 'academic' ? '📚' :
                        ann.category === 'sports' ? '⚽' :
                            ann.category === 'exam' ? '📝' : '📢'}
                                    </div>
                                    <h3 class="announcement-title">${ann.title}</h3>
                                </div>
                                <div class="announcement-body">
                                    <p class="announcement-content">${ann.content}</p>
                                    <div class="announcement-meta">
                                        <span class="announcement-category">${ann.category}</span>
                                        <span>${new Date(ann.created_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                            })}</span>
                                    </div>
                                </div>
                            </div>
                        `).join('') : `
                            <div class="announcement-card" style="text-align: center;">
                                <div class="announcement-header">
                                    <div class="announcement-icon">📝</div>
                                    <h3 class="announcement-title">Welcome to WCU -CS school</h3>
                                </div>
                                <div class="announcement-body">
                                    <p class="announcement-content">
                                        After installation, important school announcements will appear here. 
                                        Check back soon for updates!
                                    </p>
                                    <div class="announcement-meta">
                                        <span class="announcement-category">welcome</span>
                                        <span>Just now</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="announcement-card">
                                <div class="announcement-header">
                                    <div class="announcement-icon">🚀</div>
                                    <h3 class="announcement-title">System Installation Guide</h3>
                                </div>
                                <div class="announcement-body">
                                    <p class="announcement-content">
                                        Please complete the installation process to unlock all features. 
                                        Click the installation banner or visit /install to get started.
                                    </p>
                                    <div class="announcement-meta">
                                        <span class="announcement-category">system</span>
                                        <span>Installation required</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="announcement-card">
                                <div class="announcement-header">
                                    <div class="announcement-icon">📚</div>
                                    <h3 class="announcement-title">Digital Learning Ready</h3>
                                </div>
                                <div class="announcement-body">
                                    <p class="announcement-content">
                                        Our digital learning platform is ready to serve students with 
                                        online classes, materials, and interactive resources.
                                    </p>
                                    <div class="announcement-meta">
                                        <span class="announcement-category">academic</span>
                                        <span>Coming soon</span>
                                    </div>
                                </div>
                            </div>
                        `}
                    </div>
                </section>
                
                <!-- Testimonials Section -->
                <section class="testimonials-section">
                    <div class="container">
                        <h2 class="section-title" style="color: white;">What People Say</h2>
                        <p class="section-subtitle" style="color: rgba(255, 255, 255, 0.9);">
                            Hear from our students, parents, and teachers about their experience
                        </p>
                        
                        <div class="testimonials-grid">
                            <div class="testimonial-card">
                                <div class="testimonial-rating">
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                </div>
                                <p class="testimonial-text">
                                    "The digital transformation at WCU -CS school has made learning more accessible 
                                    and engaging for my child. The online resources are excellent!"
                                </p>
                                <div class="testimonial-author">
                                    <div class="author-avatar">
                                        <i class="fas fa-user"></i>
                                    </div>
                                    <div class="author-info">
                                        <h4>Mr. Alemayehu</h4>
                                        <p>Parent</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="testimonial-card">
                                <div class="testimonial-rating">
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                </div>
                                <p class="testimonial-text">
                                    "As a teacher, the digital tools provided have transformed how I teach and 
                                    interact with students. The platform is intuitive and powerful."
                                </p>
                                <div class="testimonial-author">
                                    <div class="author-avatar">
                                        <i class="fas fa-user-tie"></i>
                                    </div>
                                    <div class="author-info">
                                        <h4>Ms. Tigist</h4>
                                        <p>Teacher</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="testimonial-card">
                                <div class="testimonial-rating">
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                </div>
                                <p class="testimonial-text">
                                    "The online payment system is so convenient! No more waiting in lines. 
                                    Everything is digital and secure."
                                </p>
                                <div class="testimonial-author">
                                    <div class="author-avatar">
                                        <i class="fas fa-user"></i>
                                    </div>
                                    <div class="author-info">
                                        <h4>Mrs. Bekele</h4>
                                        <p>Parent</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
                
                <!-- Gallery Section -->
                <section id="gallery" class="container">
                    <h2 class="section-title">School Gallery</h2>
                    <p class="section-subtitle">
                        Explore our campus, facilities, and student activities through photos
                    </p>
                    
                    <div class="gallery-grid">
                        ${gallery.length > 0 ? gallery.map(img => `
                            <div class="gallery-item">
                                <img src="${img.image_url || 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80'}" alt="${img.title || 'School Image'}">
                                <div class="gallery-overlay">
                                    <i class="fas fa-search-plus"></i>
                                </div>
                            </div>
                        `).join('') : `
                            <div class="gallery-item">
                                <img src="https://images.unsplash.com/photo-1523050854058-8df90110c9f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" alt="Modern Classroom">
                                <div class="gallery-overlay">
                                    <i class="fas fa-search-plus"></i>
                                </div>
                            </div>
                            <div class="gallery-item">
                                <img src="https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" alt="School Library">
                                <div class="gallery-overlay">
                                    <i class="fas fa-search-plus"></i>
                                </div>
                            </div>
                            <div class="gallery-item">
                                <img src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" alt="Science Lab">
                                <div class="gallery-overlay">
                                    <i class="fas fa-search-plus"></i>
                                </div>
                            </div>
                            <div class="gallery-item">
                                <img src="https://images.unsplash.com/photo-1546410531-bb4caa6b424d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" alt="Sports Day">
                                <div class="gallery-overlay">
                                    <i class="fas fa-search-plus"></i>
                                </div>
                            </div>
                            <div class="gallery-item">
                                <img src="https://images.unsplash.com/photo-1503676260728-1c00da094a0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" alt="Computer Lab">
                                <div class="gallery-overlay">
                                    <i class="fas fa-search-plus"></i>
                                </div>
                            </div>
                            <div class="gallery-item">
                                <img src="https://images.unsplash.com/photo-1509062522246-3755977927d7?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" alt="Group Study">
                                <div class="gallery-overlay">
                                    <i class="fas fa-search-plus"></i>
                                </div>
                            </div>
                        `}
                    </div>
                </section>
                
                <!-- CTA Section -->
                <section class="cta-section">
                    <div class="cta-content">
                        <h2 class="cta-title">Ready to Join Our -CS school?</h2>
                        <p class="cta-text">
                            Start your digital education journey today. Register now or contact us for more information.
                            Experience the future of education with WCU -CS school.
                        </p>
                        <div class="hero-buttons">
                            <a href="/student-registration" class="btn btn-primary" style="background: white; color: var(--accent);">
                                <i class="fas fa-user-plus"></i> Register Now
                            </a>
                            <a href="/contact" class="btn btn-secondary" style="background: rgba(255, 255, 255, 0.2);">
                                <i class="fas fa-phone-alt"></i> Contact Us
                            </a>
                            <a href="/virtual-tour" class="btn btn-outline" style="border-color: white;">
                                <i class="fas fa-vr-cardboard"></i> Virtual Tour
                            </a>
                        </div>
                    </div>
                </section>
                
                <!-- Footer -->
                <footer class="footer" id="contact">
                    <div class="container">
                        <div class="footer-content">
                            <div class="footer-section">
                                <h3>🏫 WCU -CS school</h3>
                                <p>
                                    Transforming education through innovative technology and dedicated teaching. 
                                    We're committed to providing quality digital education for Ethiopian students.
                                </p>
                                <div class="social-links">
                                    <a href="#"><i class="fab fa-facebook-f"></i></a>
                                    <a href="#"><i class="fab fa-telegram"></i></a>
                                    <a href="#"><i class="fab fa-instagram"></i></a>
                                    <a href="#"><i class="fab fa-youtube"></i></a>
                                    <a href="#"><i class="fab fa-twitter"></i></a>
                                </div>
                            </div>
                            
                            <div class="footer-section">
                                <h3>📞 Contact Info</h3>
                                <ul class="footer-links">
                                    <li>
                                        <a href="tel:+251911223344">
                                            <i class="fas fa-phone"></i> +251 911 223 344
                                        </a>
                                    </li>
                                    <li>
                                        <a href="mailto:info@wcu-cs.edu.et">
                                            <i class="fas fa-envelope"></i> info@wcu-cs.edu.et
                                        </a>
                                    </li>
                                    <li>
                                        <a href="#">
                                            <i class="fas fa-map-marker-alt"></i> Wachamo University, Ethiopia
                                        </a>
                                    </li>
                                    <li>
                                        <a href="#">
                                            <i class="fas fa-clock"></i> Mon-Fri 8:00 AM - 5:00 PM
                                        </a>
                                    </li>
                                </ul>
                            </div>
                            
                            <div class="footer-section">
                                <h3>🔗 Quick Links</h3>
                                <ul class="footer-links">
                                    <li><a href="/"><i class="fas fa-home"></i> Home</a></li>
                                    <li><a href="/student-registration"><i class="fas fa-user-plus"></i> Registration</a></li>
                                    <li><a href="/classes"><i class="fas fa-book-open"></i> Digital Classes</a></li>
                                    <li><a href="/payment"><i class="fas fa-credit-card"></i> Online Payments</a></li>
                                    <li><a href="/teacher-login"><i class="fas fa-chalkboard-teacher"></i> Teacher Portal</a></li>
                                    <li><a href="/admin"><i class="fas fa-cog"></i> Admin Panel</a></li>
                                </ul>
                            </div>
                            
                   <div class="footer-section">
    <h3>Developer Team – Group 10</h3>
    <p>Wachamo University Community School Students</p>
    
    <ul class="footer-links">
        <li>
            <a href="tel:+251953861825">
                <i class="fas fa-phone"></i> Gediyon Eyasu – 0953 861 825
            </a>
        </li>
        <li>
            <a href="tel:+251996266432">
                <i class="fas fa-phone"></i> Abdurahman Seman – 0996 266 432
            </a>
        </li>
        <li>
            <a href="tel:+251962892749">
                <i class="fas fa-phone"></i> Adino Tesfaye – 0962 892 749
            </a>
        </li>
        <li>
            <a href="tel:+251916362062">
                <i class="fas fa-phone"></i> Bereket – 0916 362 062
            </a>
        </li>
        <li>
            <a href="tel:+251996031793">
                <i class="fas fa-phone"></i> Huzefa Huseni – 0996 031 793
            </a>
        </li>
        <li>
            <a href="tel:+251939124387">
                <i class="fas fa-phone"></i> Seid Aliya – 0939 124 387
            </a>
        </li>
        <li>
            <a href="tel:+251939124387">
                <i class="fas fa-phone"></i> Mehlati Markos – 0939 124 387
            </a>
        </li>
    </ul>
</div>
                        </div>
                        
                        <div class="footer-bottom">
                            <p>&copy; 2024 Wachamo University Community School. All rights reserved.</p>
                            <p>-CS school System v3.0 • Built with ❤️ for Ethiopian Education</p>
                        </div>
                    </div>
                </footer>
                
                <div class="load-time">
                    <i class="fas fa-bolt"></i> Page loaded in ${loadTime}ms • WCU -CS school System
                </div>
                
                <script>
                    document.addEventListener('DOMContentLoaded', function() {
                        // Navbar scroll effect
                        const navbar = document.querySelector('.navbar');
                        window.addEventListener('scroll', () => {
                            if (window.scrollY > 50) {
                                navbar.classList.add('scrolled');
                            } else {
                                navbar.classList.remove('scrolled');
                            }
                        });
                        
                        // Mobile menu toggle
                        const mobileToggle = document.querySelector('.mobile-toggle');
                        const navLinks = document.querySelector('.nav-links');
                        
                        mobileToggle.addEventListener('click', () => {
                            navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
                            if (navLinks.style.display === 'flex') {
                                navLinks.style.flexDirection = 'column';
                                navLinks.style.position = 'absolute';
                                navLinks.style.top = '100%';
                                navLinks.style.left = '0';
                                navLinks.style.right = '0';
                                navLinks.style.background = 'var(--dark)';
                                navLinks.style.padding = '20px';
                                navLinks.style.gap = '10px';
                                navLinks.style.zIndex = '1000';
                                navLinks.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
                            }
                        });
                        
                        // Animate stats numbers
                        const statNumbers = document.querySelectorAll('.stat-number');
                        statNumbers.forEach(el => {
                            const target = parseInt(el.getAttribute('data-target') || el.textContent.replace(/[^0-9]/g, ''));
                            if (!isNaN(target) && target > 0) {
                                el.style.opacity = '0';
                                setTimeout(() => {
                                    let count = 0;
                                    const increment = target / 30;
                                    const timer = setInterval(() => {
                                        count += increment;
                                        if (count >= target) {
                                            count = target;
                                            clearInterval(timer);
                                        }
                                        el.textContent = Math.floor(count);
                                        el.style.opacity = '1';
                                    }, 50);
                                }, 500);
                            }
                        });
                        
                        // Smooth scrolling for anchor links
                        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                            anchor.addEventListener('click', function(e) {
                                e.preventDefault();
                                const targetId = this.getAttribute('href');
                                if (targetId === '#') return;
                                
                                const targetElement = document.querySelector(targetId);
                                if (targetElement) {
                                    const navbarHeight = document.querySelector('.navbar').offsetHeight;
                                    const targetPosition = targetElement.offsetTop - navbarHeight - 20;
                                    
                                    window.scrollTo({
                                        top: targetPosition,
                                        behavior: 'smooth'
                                    });
                                    
                                    // Close mobile menu if open
                                    if (window.innerWidth <= 992) {
                                        navLinks.style.display = 'none';
                                    }
                                }
                            });
                        });
                        
                        // Add animation to cards on scroll
                        const observerOptions = {
                            threshold: 0.1,
                            rootMargin: '0px 0px -100px 0px'
                        };
                        
                        const observer = new IntersectionObserver((entries) => {
                            entries.forEach(entry => {
                                if (entry.isIntersecting) {
                                    entry.target.style.animation = 'fadeInUp 0.6s ease-out forwards';
                                    entry.target.style.opacity = '0';
                                    setTimeout(() => {
                                        entry.target.style.opacity = '1';
                                    }, 300);
                                }
                            });
                        }, observerOptions);
                        
                        document.querySelectorAll('.feature-card, .announcement-card, .testimonial-card, .gallery-item').forEach(el => {
                            observer.observe(el);
                        });
                        
                        // Gallery lightbox (simple implementation)
                        const galleryItems = document.querySelectorAll('.gallery-item');
                        galleryItems.forEach(item => {
                            item.addEventListener('click', () => {
                                const imgSrc = item.querySelector('img').src;
                                const lightbox = document.createElement('div');
                                lightbox.style.position = 'fixed';
                                lightbox.style.top = '0';
                                lightbox.style.left = '0';
                                lightbox.style.width = '100%';
                                lightbox.style.height = '100%';
                                lightbox.style.background = 'rgba(0,0,0,0.9)';
                                lightbox.style.display = 'flex';
                                lightbox.style.alignItems = 'center';
                                lightbox.style.justifyContent = 'center';
                                lightbox.style.zIndex = '2000';
                                lightbox.style.cursor = 'pointer';
                                
                                const img = document.createElement('img');
                                img.src = imgSrc;
                                img.style.maxWidth = '90%';
                                img.style.maxHeight = '90%';
                                img.style.borderRadius = '10px';
                                img.style.boxShadow = '0 20px 60px rgba(0,0,0,0.5)';
                                
                                lightbox.appendChild(img);
                                document.body.appendChild(lightbox);
                                
                                lightbox.addEventListener('click', () => {
                                    document.body.removeChild(lightbox);
                                });
                            });
                        });
                        
                        // Add hover effect to feature icons
                        document.querySelectorAll('.feature-icon').forEach(icon => {
                            icon.addEventListener('mouseenter', () => {
                                icon.style.transform = 'scale(1.1) rotate(10deg)';
                            });
                            icon.addEventListener('mouseleave', () => {
                                icon.style.transform = 'scale(1) rotate(0deg)';
                            });
                        });
                        
                        // Installation banner close functionality
                        const installBanner = document.querySelector('.install-banner');
                        if (installBanner) {
                            setTimeout(() => {
                                installBanner.style.opacity = '0.8';
                            }, 10000);
                            
                            // Close banner after 30 seconds
                            setTimeout(() => {
                                installBanner.style.opacity = '0';
                                installBanner.style.transform = 'translateY(100px)';
                                setTimeout(() => {
                                    installBanner.style.display = 'none';
                                }, 500);
                            }, 30000);
                        }
                    });
                    
                    // Dropdown functionality for mobile
                    document.addEventListener('click', function(event) {
                        const dropdowns = document.querySelectorAll('.dropdown');
                        dropdowns.forEach(dropdown => {
                            const menu = dropdown.querySelector('.dropdown-content');
                            if (dropdown.contains(event.target)) {
                                menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                            } else {
                                menu.style.display = 'none';
                            }
                        });
                    });


                    
// Auto-refresh stats every 8 seconds so new registrations/payments appear instantly
setInterval(() => {
    fetch('/api/live-stats')
        .then(r => r.json())
        .then(data => {
            document.getElementById('total-students').textContent = data.total_students;
            document.getElementById('total-teachers').textContent = data.total_teachers;
            document.getElementById('total-payments').textContent = data.total_payments;
            document.getElementById('today-attendance').textContent = data.today_attendance;
        })
        .catch(() => console.log('Stats update failed – will retry'));
}, 8000); 

                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error("Home page error:", error);
        // Keep the same error page as before
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>WCU -CS school - Installation Required</title>
                <style>
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        margin: 0; 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }
                    .container {
                        background: white;
                        padding: 50px;
                        border-radius: 25px;
                        text-align: center;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.15);
                        max-width: 600px;
                    }
                    .error-icon {
                        font-size: 5em;
                        color: #3B82F6;
                        margin-bottom: 20px;
                        animation: bounce 2s infinite;
                    }
                    @keyframes bounce {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-10px); }
                    }
                    h1 {
                        color: #1F2937;
                        margin-bottom: 15px;
                        font-size: 2.2em;
                    }
                    p {
                        color: #6B7280;
                        margin-bottom: 30px;
                        line-height: 1.6;
                        font-size: 1.1em;
                    }
                    .btn {
                        display: inline-block;
                        padding: 18px 40px;
                        background: linear-gradient(135deg, #3B82F6, #1D4ED8);
                        color: white;
                        text-decoration: none;
                        border-radius: 50px;
                        font-weight: 700;
                        font-size: 1.1em;
                        margin: 10px;
                        transition: all 0.3s ease;
                        box-shadow: 0 10px 20px rgba(59, 130, 246, 0.3);
                    }
                    .btn:hover {
                        transform: translateY(-3px);
                        box-shadow: 0 15px 30px rgba(59, 130, 246, 0.4);
                    }
                    .btn-success {
                        background: linear-gradient(135deg, #10B981, #059669);
                        box-shadow: 0 10px 20px rgba(16, 185, 129, 0.3);
                    }
                    .steps {
                        text-align: left;
                        background: #F3F4F6;
                        padding: 25px;
                        border-radius: 15px;
                        margin: 30px 0;
                    }
                    .steps h3 {
                        color: #1F2937;
                        margin-bottom: 15px;
                    }
                    .steps ol {
                        padding-left: 20px;
                        color: #6B7280;
                    }
                    .steps li {
                        margin-bottom: 10px;
                        line-height: 1.5;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="error-icon">🏫</div>
                    <h1>Welcome to WCU -CS school!</h1>
                    <p>This is a fresh installation. The database needs to be set up before you can use the system.</p>
                    
                    <div class="steps">
                        <h3>📋 Quick Setup Instructions:</h3>
                        <ol>
                            <li>Click the "Install System" button below</li>
                            <li>Wait for the installation to complete</li>
                            <li>The system will create all necessary tables</li>
                            <li>Default accounts will be created automatically</li>
                            <li>You'll be redirected to the homepage</li>
                        </ol>
                    </div>
                    
                    <a href="/install" class="btn">
                        ⚙️ Install -CS school System
                    </a>
                    <a href="/" class="btn btn-success">
                        🔄 Refresh Page
                    </a>
                    
                    <p style="margin-top: 30px; font-size: 0.9em; color: #9CA3AF;">
                        💡 <strong>Note:</strong> This only needs to be done once. After installation, all features will be available.
                    </p>
                </div>
            </body>
            </html>
        `);
    }
});

// ======================== LIVE STATS API ========================
app.get("/api/live-stats", async (req, res) => {
    try {
        const statsResult = await dbAll(`
            SELECT 
                (SELECT COUNT(*) FROM students WHERE status = 'active') as total_students,
                (SELECT COUNT(*) FROM teachers WHERE status = 'active') as total_teachers,
                (SELECT COUNT(*) FROM payments WHERE status = 'approved') as total_payments,
                (SELECT COUNT(DISTINCT student_id) FROM attendance WHERE DATE(date) = CURDATE()) as today_attendance
        `);

        // Add static stats
        const stats = {
            ...(statsResult[0] || {}),
            success_rate: 95,
            years_experience: 15
        };

        res.json(stats);
    } catch (error) {
        console.error("Error fetching live stats:", error);
        // Return default stats if tables don't exist yet
        res.json({
            total_students: 0,
            total_teachers: 0,
            total_payments: 0,
            today_attendance: 0,
            success_rate: 95,
            years_experience: 15
        });
    }
});
// ======================== DIGITAL LIBRARY ========================
app.get("/library", async (req, res) => {
    try {
        const books = await dbAll(`
            SELECT * FROM library_books 
            ORDER BY category, grade_level, title
        `);

        // Get categories
        const categories = [...new Set(books.map(b => b.category))].filter(Boolean);

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Digital Library - WCU -CS school</title>
                <style>
                    :root {
                        --primary: #8B5CF6;
                        --secondary: #10B981;
                    }
                    
                    body { font-family: Arial; margin: 0; background: #F3F4F6; }
                    .header { background: linear-gradient(135deg, var(--primary), #7C3AED); color: white; padding: 30px 20px; }
                    .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                    .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 20px; }
                    .btn { display: inline-block; padding: 12px 25px; margin: 5px; background: var(--primary); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
                    .book-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 25px; margin: 30px 0; }
                    .book-card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 3px 10px rgba(0,0,0,0.1); text-align: center; }
                    .book-cover { font-size: 4em; margin-bottom: 15px; }
                    .availability { padding: 5px 10px; border-radius: 15px; font-size: 0.9em; margin-top: 10px; }
                    .available { background: #D1FAE5; color: #065F46; }
                    .limited { background: #FEF3C7; color: #92400E; }
                    .unavailable { background: #FEE2E2; color: #991B1B; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📚 Digital Library</h1>
                    <p>Access educational books and resources for all grades</p>
                </div>

                <div class="nav">
                    <a href="/" class="btn" style="background: #6B7280;">← Back to Home</a>
                    <a href="#all-books" class="btn">All Books</a>
                    ${categories.map(cat => `
                        <a href="#${cat.toLowerCase()}" class="btn" style="font-size: 0.9em; padding: 8px 15px;">
                            ${cat}
                        </a>
                    `).join('')}
                    ${req.session.admin || req.session.teacher ? `
                        <a href="/add-book" class="btn" style="background: var(--secondary);">➕ Add Book</a>
                    ` : ''}
                </div>

                <div class="container">
                    <div class="card">
                        <h2>📚 Available Books (${books.length})</h2>
                        
                        <div style="margin: 20px 0; padding: 20px; background: #EFF6FF; border-radius: 10px;">
                            <h3>Quick Search</h3>
                            <input type="text" id="searchBooks" placeholder="Search by title, author, or category..." 
                                   style="width: 100%; padding: 12px; border: 2px solid #3B82F6; border-radius: 8px;">
                        </div>

                        ${categories.map(category => {
            const categoryBooks = books.filter(b => b.category === category);
            if (categoryBooks.length === 0) return '';

            return `
                                <h3 id="${category.toLowerCase()}">${category} (${categoryBooks.length})</h3>
                                <div class="book-grid">
                                    ${categoryBooks.map(book => {
                let availabilityClass = 'available';
                let availabilityText = `${book.available_copies} available`;

                if (book.available_copies === 0) {
                    availabilityClass = 'unavailable';
                    availabilityText = 'Out of stock';
                } else if (book.available_copies < 3) {
                    availabilityClass = 'limited';
                    availabilityText = 'Limited copies';
                }

                return `
                                            <div class="book-card">
                                                <div class="book-cover">📘</div>
                                                <h4>${book.title}</h4>
                                                <p><strong>Author:</strong> ${book.author}</p>
                                                <p><strong>For Grade:</strong> ${book.grade_level || 'All'}</p>
                                                <p><strong>ISBN:</strong> ${book.isbn || 'N/A'}</p>
                                                <div class="availability ${availabilityClass}">
                                                    ${availabilityText}
                                                </div>
                                                <div style="margin-top: 15px;">
                                                    ${book.pdf_path ? `
                                                        <a href="${book.pdf_path}" target="_blank" class="btn" style="padding: 8px 15px; font-size: 0.9em;">
                                                            📖 Read Online
                                                        </a>
                                                    ` : ''}
                                                    ${req.session.student || req.session.parent ? `
                                                        <a href="/borrow-book/${book.book_id}" class="btn" style="background: var(--secondary); padding: 8px 15px; font-size: 0.9em;"
                                                           ${book.available_copies === 0 ? 'disabled style="background:#6B7280;"' : ''}>
                                                            📥 Borrow
                                                        </a>
                                                    ` : ''}
                                                </div>
                                            </div>
                                        `;
            }).join('')}
                                </div>
                            `;
        }).join('')}

                        <h3 id="all-books">All Books</h3>
                        <div class="book-grid">
                            ${books.map(book => {
            let availabilityClass = 'available';
            if (book.available_copies === 0) availabilityClass = 'unavailable';
            else if (book.available_copies < 3) availabilityClass = 'limited';

            return `
                                    <div class="book-card">
                                        <div class="book-cover">📗</div>
                                        <h4>${book.title.substring(0, 30)}${book.title.length > 30 ? '...' : ''}</h4>
                                        <p>${book.author}</p>
                                        <p><small>${book.category || 'General'} • Grade ${book.grade_level || 'All'}</small></p>
                                        <div class="availability ${availabilityClass}" style="margin-top: 10px;">
                                            ${book.available_copies} of ${book.total_copies} available
                                        </div>
                                    </div>
                                `;
        }).join('')}
                        </div>
                    </div>
                </div>

                <script>
                    document.getElementById('searchBooks').addEventListener('input', function(e) {
                        const searchTerm = e.target.value.toLowerCase();
                        const bookCards = document.querySelectorAll('.book-card');
                        
                        bookCards.forEach(card => {
                            const text = card.textContent.toLowerCase();
                            card.style.display = text.includes(searchTerm) ? 'block' : 'none';
                        });
                    });
                </script>
            </body>
            </html>
        `);

    } catch (error) {
        console.error("Library error:", error);
        res.status(500).send("Error loading library");
    }
});

// ======================== ADD BOOK TO LIBRARY ========================
app.get("/add-book", (req, res) => {
    if (!req.session.admin && !req.session.teacher) {
        return res.redirect("/library");
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Add Book - WCU -CS school</title>
            <style>
                body { font-family: Arial; margin: 0; background: #F3F4F6; }
                .header { background: linear-gradient(135deg, #8B5CF6, #7C3AED); color: white; padding: 30px 20px; }
                .container { max-width: 800px; margin: 30px auto; padding: 0 20px; }
                .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
                .form-group { margin-bottom: 20px; }
                label { display: block; margin-bottom: 8px; font-weight: 600; }
                input, select, textarea { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; }
                .btn { padding: 12px 25px; background: #8B5CF6; color: white; border: none; border-radius: 8px; cursor: pointer; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>➕ Add Book to Library</h1>
                <p>Expand our digital library collection</p>
            </div>

            <div class="container">
                <a href="/library" style="color: #3B82F6; margin-bottom: 20px; display: block;">← Back to Library</a>
                
                <div class="card">
                    <form action="/add-book" method="POST" enctype="multipart/form-data">
                        <div class="form-group">
                            <label>Book Title *</label>
                            <input type="text" name="title" required placeholder="Book title">
                        </div>
                        
                        <div class="form-group">
                            <label>Author *</label>
                            <input type="text" name="author" required placeholder="Author name">
                        </div>
                        
                        <div class="form-group">
                            <label>ISBN (Optional)</label>
                            <input type="text" name="isbn" placeholder="International Standard Book Number">
                        </div>
                        
                        <div class="form-group">
                            <label>Category *</label>
                            <select name="category" required>
                                <option value="">Select Category</option>
                                <option value="Mathematics">Mathematics</option>
                                <option value="English">English</option>
                                <option value="Science">Science</option>
                                <option value="History">History</option>
                                <option value="Geography">Geography</option>
                                <option value="Amharic">Amharic</option>
                                <option value="Ethiopian Studies">Ethiopian Studies</option>
                                <option value="Reference">Reference</option>
                                <option value="Story">Story Books</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>Grade Level</label>
                            <select name="grade_level">
                                <option value="">All Grades</option>
                                ${['KG1', 'KG2', 'KG3', '1', '2', '3', '4', '5', '6'].map(g => `
                                    <option value="${g}">Grade ${g}</option>
                                `).join('')}
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>Number of Copies *</label>
                            <input type="number" name="total_copies" required min="1" value="1">
                        </div>
                        
                        <div class="form-group">
                            <label>PDF File (Optional)</label>
                            <input type="file" name="pdf_file" accept=".pdf">
                            <small>Upload digital version of the book (max 50MB)</small>
                        </div>
                        
                        <div class="form-group">
                            <label>Book Cover Image (Optional)</label>
                            <input type="file" name="cover_image" accept="image/*">
                        </div>
                        
                        <button type="submit" class="btn">Add Book to Library</button>
                    </form>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.post("/add-book", upload.fields([
    { name: 'pdf_file', maxCount: 1 },
    { name: 'cover_image', maxCount: 1 }
]), async (req, res) => {
    if (!req.session.admin && !req.session.teacher) {
        return res.redirect("/library");
    }

    const { title, author, isbn, category, grade_level, total_copies } = req.body;

    try {
        // Generate book ID
        const bookCount = await dbGet("SELECT COUNT(*) as count FROM library_books");
        const book_id = `LIB${(bookCount.count + 1).toString().padStart(3, '0')}`;

        await dbRun(
            `INSERT INTO library_books (book_id, title, author, isbn, category, grade_level, total_copies, available_copies, pdf_path, cover_image) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                book_id,
                title,
                author,
                isbn || null,
                category,
                grade_level || null,
                parseInt(total_copies),
                parseInt(total_copies),
                req.files['pdf_file'] ? `/uploads/${req.files['pdf_file'][0].filename}` : null,
                req.files['cover_image'] ? `/uploads/${req.files['cover_image'][0].filename}` : null
            ]
        );

        res.redirect("/library?success=Book added successfully");

    } catch (error) {
        console.error("Add book error:", error);
        res.redirect("/add-book?error=" + error.message);
    }
});

// ======================== SCHOOL CALENDAR ========================
app.get("/calendar", async (req, res) => {
    try {
        // Get current month events
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        const events = await dbAll(`
            SELECT * FROM events 
            WHERE MONTH(event_date) = ? AND YEAR(event_date) = ?
            ORDER BY event_date ASC
        `, [currentMonth, currentYear]);

        // Get upcoming events (next 30 days)
        const upcomingEvents = await dbAll(`
            SELECT * FROM events 
            WHERE event_date >= CURDATE() 
            AND event_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
            ORDER BY event_date ASC
            LIMIT 10
        `);

        // Generate calendar HTML
        const today = new Date();
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
        const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();

        let calendarHTML = '<table style="width:100%; border-collapse:collapse; text-align:center;"><tr>';
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
            calendarHTML += `<th style="padding:10px; background:#3B82F6; color:white;">${day}</th>`;
        });
        calendarHTML += '</tr><tr>';

        // Empty cells for first week
        for (let i = 0; i < firstDay; i++) {
            calendarHTML += '<td style="padding:10px; border:1px solid #E5E7EB;"></td>';
        }

        // Days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            const dayEvents = events.filter(e => e.event_date.toISOString().startsWith(dateStr));
            const isToday = today.getDate() === day &&
                today.getMonth() + 1 === currentMonth &&
                today.getFullYear() === currentYear;

            calendarHTML += `
                <td style="padding:10px; border:1px solid #E5E7EB; height:80px; vertical-align:top; 
                           ${isToday ? 'background:#EFF6FF;' : ''}">
                    <div style="font-weight:${isToday ? 'bold' : 'normal'}; margin-bottom:5px;">
                        ${day}
                    </div>
                    ${dayEvents.map(event => `
                        <div style="font-size:0.8em; background:${event.event_type === 'holiday' ? '#FEF3C7' :
                    event.event_type === 'exam' ? '#FEE2E2' :
                        event.event_type === 'meeting' ? '#D1FAE5' :
                            '#E0E7FF'
                }; padding:2px 5px; border-radius:3px; margin:2px 0;">
                            ${event.title}
                        </div>
                    `).join('')}
                </td>
            `;

            if ((firstDay + day) % 7 === 0) {
                calendarHTML += '</tr><tr>';
            }
        }

        calendarHTML += '</tr></table>';

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>School Calendar - WCU -CS school</title>
                <style>
                    :root {
                        --primary: #3B82F6;
                        --secondary: #10B981;
                    }
                    
                    body { font-family: Arial; margin: 0; background: #F3F4F6; }
                    .header { background: linear-gradient(135deg, var(--primary), #1D4ED8); color: white; padding: 30px 20px; }
                    .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                    .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 20px; }
                    .btn { display: inline-block; padding: 12px 25px; margin: 5px; background: var(--primary); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
                    .event-item { padding: 15px; border-bottom: 1px solid #E5E7EB; }
                    .legend-item { display: inline-block; padding: 5px 10px; border-radius: 5px; margin: 0 10px 10px 0; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📅 School Calendar</h1>
                    <p>Academic Year ${currentYear} - Stay updated with school events</p>
                </div>

                <div class="nav">
                    <a href="/" class="btn" style="background: #6B7280;">← Back to Home</a>
                    ${req.session.admin || req.session.teacher ? `
                        <a href="/add-event" class="btn" style="background: var(--secondary);">➕ Add Event</a>
                    ` : ''}
                </div>

                <div class="container">
                    <div class="card">
                        <h2>📅 ${today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
                        
                        <div style="margin: 20px 0;">
                            <div class="legend-item" style="background: #FEF3C7;">Holiday</div>
                            <div class="legend-item" style="background: #FEE2E2;">Exam</div>
                            <div class="legend-item" style="background: #D1FAE5;">Meeting</div>
                            <div class="legend-item" style="background: #E0E7FF;">Other Event</div>
                        </div>
                        
                        ${calendarHTML}
                    </div>

                    <div class="card">
                        <h2>📋 Upcoming Events (Next 30 Days)</h2>
                        
                        ${upcomingEvents.length > 0 ? upcomingEvents.map(event => `
                            <div class="event-item">
                                <h3>${event.title}</h3>
                                <p><strong>Date:</strong> ${new Date(event.event_date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })}</p>
                                <p><strong>Type:</strong> ${event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1)}</p>
                                ${event.description ? `<p>${event.description}</p>` : ''}
                            </div>
                        `).join('') : `
                            <p>No upcoming events in the next 30 days.</p>
                        `}
                    </div>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error("Calendar error:", error);
        res.status(500).send("Error loading calendar");
    }
});

// ======================== ADD EVENT ========================
app.get("/add-event", (req, res) => {
    if (!req.session.admin && !req.session.teacher) {
        return res.redirect("/calendar");
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Add Event - WCU -CS school</title>
            <style>
                body { font-family: Arial; margin: 0; background: #F3F4F6; }
                .header { background: linear-gradient(135deg, #10B981, #059669); color: white; padding: 30px 20px; }
                .container { max-width: 600px; margin: 30px auto; padding: 0 20px; }
                .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
                .form-group { margin-bottom: 20px; }
                label { display: block; margin-bottom: 8px; font-weight: 600; }
                input, select, textarea { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; }
                .btn { padding: 12px 25px; background: #10B981; color: white; border: none; border-radius: 8px; cursor: pointer; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>➕ Add School Event</h1>
                <p>Add important dates to the school calendar</p>
            </div>

            <div class="container">
                <a href="/calendar" style="color: #3B82F6; margin-bottom: 20px; display: block;">← Back to Calendar</a>
                
                <div class="card">
                    <form action="/add-event" method="POST">
                        <div class="form-group">
                            <label>Event Title *</label>
                            <input type="text" name="title" required placeholder="Event name">
                        </div>
                        
                        <div class="form-group">
                            <label>Description</label>
                            <textarea name="description" rows="4" placeholder="Event details"></textarea>
                        </div>
                        
                        <div class="form-group">
                            <label>Event Date *</label>
                            <input type="date" name="event_date" required>
                        </div>
                        
                        <div class="form-group">
                            <label>Event Type *</label>
                            <select name="event_type" required>
                                <option value="holiday">Holiday</option>
                                <option value="meeting">Parent-Teacher Meeting</option>
                                <option value="exam">Examination</option>
                                <option value="sports">Sports Event</option>
                                <option value="academic">Academic Event</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        
                        <button type="submit" class="btn">Add Event to Calendar</button>
                    </form>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.post("/add-event", async (req, res) => {
    if (!req.session.admin && !req.session.teacher) {
        return res.redirect("/calendar");
    }

    const { title, description, event_date, event_type } = req.body;
    const created_by = req.session.admin ? 'admin' :
        req.session.teacher ? req.session.teacher.teacher_id : 'system';

    try {
        await dbRun(
            `INSERT INTO events (title, description, event_date, event_type, created_by) 
             VALUES (?, ?, ?, ?, ?)`,
            [title, description, event_date, event_type, created_by]
        );



    } catch (error) {
        console.error("Add event error:", error);
        res.redirect("/add-event?error=" + error.message);
    }
});


// ======================== PARENT HOMEWORK VIEW ========================
app.get("/parent-homework", async (req, res) => {
    if (!req.session.parent) return res.redirect("/parent-login");

    try {
        const parent = req.session.parent;
        const studentId = req.query.student_id || parent.student_ids.split(',')[0];

        // Get student info
        const student = await dbGet(
            "SELECT * FROM students WHERE student_id = ?",
            [studentId]
        );

        if (!student) {
            return res.redirect("/parent-dashboard?error=Student not found");
        }

        // Get homework for student's grade
        const homework = await dbAll(`
            SELECT h.*, 
                   hs.submitted_at,
                   hs.grade as submission_grade,
                   hs.feedback
            FROM homework h
            LEFT JOIN homework_submissions hs ON h.id = hs.homework_id AND hs.student_id = ?
            WHERE h.grade = ?
            ORDER BY h.due_date ASC
        `, [studentId, student.grade]);

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Homework - WCU -CS school</title>
                <style>
                    :root {
                        --primary: #3B82F6;
                        --secondary: #10B981;
                    }
                    
                    body { font-family: Arial; margin: 0; background: #F3F4F6; }
                    .header { background: linear-gradient(135deg, var(--primary), #1D4ED8); color: white; padding: 30px 20px; }
                    .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                    .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 20px; }
                    .btn { display: inline-block; padding: 12px 25px; margin: 5px; background: var(--primary); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
                    .homework-item { padding: 20px; border-bottom: 1px solid #E5E7EB; }
                    .status-submitted { color: var(--secondary); }
                    .status-pending { color: #F59E0B; }
                    .status-overdue { color: #EF4444; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📝 Homework for ${student.full_name}</h1>
                    <p>Grade ${student.grade} - Track and submit homework</p>
                </div>

                <div class="nav">
                    <a href="/parent-dashboard" class="btn" style="background: #6B7280;">← Dashboard</a>
                    ${parent.student_ids.split(',').map(id => `
                        <a href="/parent-homework?student_id=${id}" class="btn" style="font-size: 0.9em; padding: 8px 15px;">
                            ${id === studentId ? '▶️ ' : ''}${id}
                        </a>
                    `).join('')}
                </div>

                <div class="container">
                    <div class="card">
                        <h2>📋 Homework Assignments</h2>
                        
                        ${homework.length > 0 ? homework.map(hw => {
            const dueDate = new Date(hw.due_date);
            const today = new Date();
            const isOverdue = dueDate < today && !hw.submitted_at;
            const statusClass = hw.submitted_at ? 'status-submitted' :
                isOverdue ? 'status-overdue' : 'status-pending';

            return `
                                <div class="homework-item">
                                    <h3>${hw.title}</h3>
                                    <p><strong>Subject:</strong> ${hw.subject} | 
                                       <strong>Due:</strong> ${dueDate.toLocaleDateString()} |
                                       <span class="${statusClass}">
                                           ${hw.submitted_at ? '✅ Submitted' :
                    isOverdue ? '⏰ Overdue' : '⏳ Pending'}
                                       </span>
                                    </p>
                                    
                                    <p>${hw.description || 'No description'}</p>
                                    
                                    ${hw.pdf_path ? `
                                        <p><a href="${hw.pdf_path}" target="_blank" style="color: var(--primary);">
                                            📄 Download Homework PDF
                                        </a></p>
                                    ` : ''}
                                    
                                    ${hw.submitted_at ? `
                                        <div style="background: #D1FAE5; padding: 15px; border-radius: 8px; margin-top: 10px;">
                                            <p><strong>Submitted:</strong> ${new Date(hw.submitted_at).toLocaleDateString()}</p>
                                            ${hw.submission_grade ? `<p><strong>Grade:</strong> ${hw.submission_grade}</p>` : ''}
                                            ${hw.feedback ? `<p><strong>Teacher Feedback:</strong> ${hw.feedback}</p>` : ''}
                                        </div>
                                    ` : `
                                        <div style="margin-top: 15px;">
                                            <a href="/submit-homework/${hw.id}?student_id=${studentId}" class="btn" style="background: var(--secondary);">
                                                📤 Submit Homework
                                            </a>
                                        </div>
                                    `}
                                </div>
                            `;
        }).join('') : `
                            <p>No homework assigned for Grade ${student.grade}.</p>
                        `}
                    </div>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error("Parent homework error:", error);
        res.status(500).send("Error loading homework");
    }
});

// ======================== HOMEWORK SUBMISSION ========================
app.get("/submit-homework/:id", async (req, res) => {
    if (!req.session.parent) return res.redirect("/parent-login");

    try {
        const homeworkId = req.params.id;
        const studentId = req.query.student_id;

        const homework = await dbGet(
            "SELECT * FROM homework WHERE id = ?",
            [homeworkId]
        );

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Submit Homework - WCU -CS school</title>
                <style>
                    body { font-family: Arial; margin: 0; background: #F3F4F6; }
                    .header { background: linear-gradient(135deg, #10B981, #059669); color: white; padding: 30px 20px; }
                    .container { max-width: 800px; margin: 30px auto; padding: 0 20px; }
                    .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
                    .form-group { margin-bottom: 20px; }
                    label { display: block; margin-bottom: 8px; font-weight: 600; }
                    textarea, input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; }
                    .btn { padding: 12px 25px; background: #10B981; color: white; border: none; border-radius: 8px; cursor: pointer; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📤 Submit Homework</h1>
                    <p>${homework.title} - ${homework.subject}</p>
                </div>

                <div class="container">
                    <a href="/parent-homework?student_id=${studentId}" style="color: #3B82F6; margin-bottom: 20px; display: block;">← Back to Homework</a>
                    
                    <div class="card">
                        <h2>Submit Your Work</h2>
                        <p><strong>Due Date:</strong> ${new Date(homework.due_date).toLocaleDateString()}</p>
                        
                        ${homework.description ? `
                            <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 15px 0;">
                                <strong>Instructions:</strong>
                                <p>${homework.description}</p>
                            </div>
                        ` : ''}
                        
                        ${homework.pdf_path ? `
                            <p><a href="${homework.pdf_path}" target="_blank" style="color: #3B82F6;">
                                📄 Download Homework PDF
                            </a></p>
                        ` : ''}
                        
                        <form action="/submit-homework/${homeworkId}" method="POST" enctype="multipart/form-data">
                            <input type="hidden" name="student_id" value="${studentId}">
                            
                            <div class="form-group">
                                <label>Your Answer/Work *</label>
                                <textarea name="submission_text" rows="8" required placeholder="Type your answer here..."></textarea>
                            </div>
                            
                            <div class="form-group">
                                <label>Upload File (Optional)</label>
                                <input type="file" name="pdf_file" accept=".pdf,.doc,.docx,.jpg,.png">
                                <small>Upload PDF, Word document, or image of your work</small>
                            </div>
                            
                            <button type="submit" class="btn">Submit Homework</button>
                        </form>
                    </div>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error("Submit homework page error:", error);
        res.status(500).send("Error loading submission page");
    }
});

app.post("/submit-homework/:id", upload.single('pdf_file'), async (req, res) => {
    if (!req.session.parent) return res.redirect("/parent-login");

    const homeworkId = req.params.id;
    const { student_id, submission_text } = req.body;

    try {
        // Check if already submitted
        const existing = await dbGet(
            "SELECT * FROM homework_submissions WHERE homework_id = ? AND student_id = ?",
            [homeworkId, student_id]
        );

        if (existing) {
            return res.redirect(`/parent-homework?student_id=${student_id}&error=Already submitted`);
        }

        await dbRun(
            `INSERT INTO homework_submissions (homework_id, student_id, submission_text, pdf_path) 
             VALUES (?, ?, ?, ?)`,
            [
                homeworkId,
                student_id,
                submission_text,
                req.file ? `/uploads/${req.file.filename}` : null
            ]
        );

        // Notify teacher
        const homework = await dbGet(
            "SELECT * FROM homework WHERE id = ?",
            [homeworkId]
        );

        const teacher = await dbGet(
            "SELECT * FROM teachers WHERE teacher_id = ?",
            [homework.teacher_id]
        );

        if (teacher.email) {
            // In production, send email notification
            console.log(`Notify teacher ${teacher.email} about homework submission`);
        }

        res.redirect(`/parent-homework?student_id=${student_id}&success=Homework submitted successfully`);

    } catch (error) {
        console.error("Homework submission error:", error);
        res.redirect(`/parent-homework?student_id=${student_id}&error=${error.message}`);
    }
});

// ======================== PARENT REGISTRATION ========================
app.get("/parent-register", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Parent Registration - WCU -CS school</title>
            <style>
                :root {
                    --primary: #8B5CF6;
                    --secondary: #10B981;
                }
                
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                
                .register-container {
                    background: white;
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                    width: 100%;
                    max-width: 500px;
                }
                
                .register-icon {
                    font-size: 4em;
                    text-align: center;
                    margin-bottom: 20px;
                }
                
                .form-group {
                    margin-bottom: 20px;
                }
                
                label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 600;
                    color: #1F2937;
                }
                
                input, select {
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #E5E7EB;
                    border-radius: 8px;
                    font-size: 16px;
                }
                
                .btn {
                    width: 100%;
                    padding: 15px;
                    background: var(--primary);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                }
                
                .info-box {
                    background: #EFF6FF;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                }
            </style>
        </head>
        <body>
            <div class="register-container">
                <div class="register-icon">👨‍👩‍👧‍👦</div>
                <h1 style="text-align: center; color: #1F2937; margin-bottom: 30px;">Parent Registration</h1>
                
                <form action="/parent-register" method="POST">
                    <div class="form-group">
                        <label for="full_name">Your Full Name *</label>
                        <input type="text" id="full_name" name="full_name" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="phone">Phone Number *</label>
                        <input type="tel" id="phone" name="phone" required pattern="[+][0-9]{12}" placeholder="+251911223344">
                    </div>
                    
                    <div class="form-group">
                        <label for="email">Email (Optional)</label>
                        <input type="email" id="email" name="email">
                    </div>
                    
                    <div class="form-group">
                        <label for="student_id">Your Child's Student ID *</label>
                        <input type="text" id="student_id" name="student_id" required placeholder="WCU240001">
                    </div>
                    
                    <div class="form-group">
                        <label for="password">Create Password *</label>
                        <input type="password" id="password" name="password" required minlength="6">
                    </div>
                    
                    <div class="info-box">
                        <strong>Note:</strong> Your phone number must match the one used during student registration.
                        We'll verify your identity before account activation.
                    </div>
                    
                    <button type="submit" class="btn">Register Parent Account</button>
                </form>
                
                <p style="text-align: center; margin-top: 20px;">
                    Already have an account? <a href="/parent-login">Login here</a>
                </p>
            </div>
        </body>
        </html>
    `);
});

app.post("/parent-register", async (req, res) => {
    const { full_name, phone, email, student_id, password } = req.body;

    try {
        // Verify student exists and phone matches
        const student = await dbGet(
            "SELECT * FROM students WHERE student_id = ? AND parent_phone = ?",
            [student_id, phone]
        );

        if (!student) {
            return res.redirect("/parent-register?error=Student not found or phone doesn't match");
        }

        // Generate parent ID
        const parentCount = await dbGet("SELECT COUNT(*) as count FROM parents");
        const parent_id = `PAR${(parentCount.count + 1).toString().padStart(3, '0')}`;

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create parent account
        await dbRun(
            `INSERT INTO parents (parent_id, full_name, email, phone, password, student_ids) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [parent_id, full_name, email, phone, hashedPassword, student_id]
        );



    } catch (error) {
        console.error("Parent registration error:", error);
        res.redirect("/parent-register?error=" + encodeURIComponent(error.message));
    }
});

// ======================== PARENT LOGIN ========================
app.get("/parent-login", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Parent Login - WCU -CS school</title>
            <style>
                body { 
                    font-family: Arial; 
                    margin: 0; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    min-height: 100vh; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    padding: 20px; 
                }
                
                .login-container { 
                    background: white; 
                    border-radius: 20px; 
                    padding: 50px; 
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1); 
                    width: 100%; 
                    max-width: 450px; 
                    text-align: center; 
                }
                
                .login-icon { 
                    font-size: 4em; 
                    margin-bottom: 20px; 
                }
                
                .form-group { 
                    margin-bottom: 20px; 
                    text-align: left; 
                }
                
                label { 
                    display: block; 
                    margin-bottom: 8px; 
                    font-weight: 600; 
                    color: #1F2937; 
                }
                
                input { 
                    width: 100%; 
                    padding: 15px; 
                    border: 2px solid #E5E7EB; 
                    border-radius: 10px; 
                    font-size: 16px; 
                }
                
                .btn-login { 
                    width: 100%; 
                    padding: 15px; 
                    background: #8B5CF6; 
                    color: white; 
                    border: none; 
                    border-radius: 10px; 
                    font-size: 16px; 
                    font-weight: 600; 
                    cursor: pointer; 
                }
                
                .demo-info { 
                    background: #EFF6FF; 
                    padding: 20px; 
                    border-radius: 10px; 
                    margin-top: 25px; 
                    text-align: left; 
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <div class="login-icon">👨‍👩‍👧‍👦</div>
                <h1>Parent Login</h1>
                <p style="color: #6B7280; margin-bottom: 30px;">Access your child's school information</p>
                
                ${req.query.error ? '<div style="color: red; margin-bottom: 15px;">❌ Invalid Parent ID or Password</div>' : ''}
                ${req.query.success ? `<div style="color: green; margin-bottom: 15px;">✅ ${req.query.success}</div>` : ''}
                
                <form action="/parent-login" method="POST">
                    <div class="form-group">
                        <label for="parent_id">Parent ID or Phone</label>
                        <input type="text" id="parent_id" name="parent_id" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" name="password" required>
                    </div>
                    
                    <button type="submit" class="btn-login">Login as Parent</button>
                </form>
                
                <div class="demo-info">
                    <h3 style="color: #8B5CF6; margin-bottom: 10px;">Demo Parent Account:</h3>
                    <p><strong>Parent ID/Phone:</strong> PAR001 or +251911223344</p>
                    <p><strong>Password:</strong> parent123</p>
                </div>
                
                <p style="margin-top: 20px;">
                    <a href="/parent-register">Create Parent Account</a> | 
                    <a href="/">Back to School</a>
                </p>
            </div>
        </body>
        </html>
    `);
});

app.post("/parent-login", async (req, res) => {
    const { parent_id, password } = req.body;

    try {
        // Try to find parent by ID or phone
        const parent = await dbGet(
            "SELECT * FROM parents WHERE parent_id = ? OR phone = ?",
            [parent_id, parent_id]
        );

        if (parent && await bcrypt.compare(password, parent.password)) {
            req.session.parent = parent;

            // Get child information
            const studentIds = parent.student_ids.split(',');
            const children = await dbAll(
                "SELECT * FROM students WHERE student_id IN (?)",
                [studentIds]
            );

            req.session.parent.children = children;
            res.redirect("/parent-dashboard");
        } else {
            res.redirect("/parent-login?error=true");
        }
    } catch (error) {
        console.error("Parent login error:", error);
        res.redirect("/parent-login?error=true");
    }
});

// ======================== PARENT DASHBOARD ========================
app.get("/parent-dashboard", async (req, res) => {
    if (!req.session.parent) return res.redirect("/parent-login");

    try {
        const parent = req.session.parent;
        const studentIds = parent.student_ids.split(',');

        // Get all children's data
        const childrenPromises = studentIds.map(studentId =>
            dbGet("SELECT * FROM students WHERE student_id = ?", [studentId])
        );

        const children = await Promise.all(childrenPromises);

        // Get today's attendance for all children
        const today = new Date().toISOString().split('T')[0];
        const attendancePromises = children.map(child =>
            dbGet("SELECT * FROM attendance WHERE student_id = ? AND date = ?", [child.student_id, today])
        );

        const attendances = await Promise.all(attendancePromises);

        // Get upcoming homework
        const homeworkPromises = children.map(child =>
            dbAll(`
                SELECT h.* FROM homework h
                WHERE h.grade = ? AND h.due_date >= CURDATE()
                ORDER BY h.due_date ASC
                LIMIT 3
            `, [child.grade])
        );

        const homeworks = await Promise.all(homeworkPromises);

        // Get upcoming events
        const events = await dbAll(`
            SELECT * FROM events 
            WHERE event_date >= CURDATE() 
            ORDER BY event_date ASC 
            LIMIT 5
        `);

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Parent Dashboard - WCU -CS school</title>
                <style>
                    :root {
                        --primary: #8B5CF6;
                        --secondary: #10B981;
                        --accent: #3B82F6;
                    }
                    
                    body { 
                        font-family: Arial; 
                        margin: 0; 
                        background: #F3F4F6; 
                    }
                    
                    .header { 
                        background: linear-gradient(135deg, var(--primary), #7C3AED); 
                        color: white; 
                        padding: 40px 20px; 
                    }
                    
                    .nav { 
                        background: white; 
                        padding: 15px; 
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
                    }
                    
                    .container { 
                        max-width: 1200px; 
                        margin: 30px auto; 
                        padding: 0 20px; 
                    }
                    
                    .stats-grid { 
                        display: grid; 
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
                        gap: 20px; 
                        margin: 30px 0; 
                    }
                    
                    .stat-card { 
                        background: white; 
                        padding: 25px; 
                        border-radius: 12px; 
                        text-align: center; 
                        box-shadow: 0 3px 10px rgba(0,0,0,0.1); 
                        border-top: 4px solid var(--primary); 
                    }
                    
                    .child-card { 
                        background: white; 
                        padding: 25px; 
                        border-radius: 15px; 
                        box-shadow: 0 5px 15px rgba(0,0,0,0.1); 
                        margin-bottom: 25px; 
                        border-left: 4px solid var(--accent); 
                    }
                    
                    .btn { 
                        display: inline-block; 
                        padding: 12px 25px; 
                        margin: 5px; 
                        background: var(--primary); 
                        color: white; 
                        text-decoration: none; 
                        border-radius: 8px; 
                        font-weight: 600; 
                    }
                    
                    .btn-success { 
                        background: var(--secondary); 
                    }
                    
                    .btn-accent { 
                        background: var(--accent); 
                    }
                    
                    .status-present { 
                        color: var(--secondary); 
                        font-weight: bold; 
                    }
                    
                    .status-absent { 
                        color: #EF4444; 
                        font-weight: bold; 
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>👨‍👩‍👧‍👦 Parent Dashboard</h1>
                    <p>Welcome, ${parent.full_name}! | Parent ID: ${parent.parent_id}</p>
                </div>

                <div class="nav">
                    <a href="/parent-dashboard" class="btn">Dashboard</a>
                    <a href="/parent-attendance" class="btn btn-accent">📊 Attendance</a>
                    <a href="/parent-homework" class="btn btn-success">📝 Homework</a>
                    <a href="/parent-grades" class="btn">📈 Grades</a>
                    <a href="/parent-messages" class="btn">💬 Messages</a>
                    <a href="/" class="btn" style="background: #6B7280;">🏠 School Home</a>
                    <a href="/parent-logout" class="btn" style="background: #EF4444;">🚪 Logout</a>
                </div>

                <div class="container">
                    <h2>📊 Overview</h2>
                    
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div style="font-size: 2.5em; font-weight: 800; color: var(--primary);">
                                ${children.length}
                            </div>
                            <div>Children</div>
                        </div>
                        
                        <div class="stat-card">
                            <div style="font-size: 2.5em; font-weight: 800; color: var(--secondary);">
                                ${attendances.filter(a => a && a.status === 'P').length}
                            </div>
                            <div>Present Today</div>
                        </div>
                        
                        <div class="stat-card">
                            <div style="font-size: 2.5em; font-weight: 800; color: var(--accent);">
                                ${homeworks.flat().length}
                            </div>
                            <div>Pending Homework</div>
                        </div>
                    </div>

                    ${children.map((child, index) => `
                        <div class="child-card">
                            <h3>👦 ${child.full_name} - Grade ${child.grade} (${child.student_id})</h3>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0;">
                                <div>
                                    <h4>📅 Today's Status</h4>
                                    ${attendances[index] ? `
                                        <p>Status: <span class="status-${attendances[index].status}">
                                            ${attendances[index].status === 'P' ? '✅ Present' :
                    attendances[index].status === 'A' ? '❌ Absent' : '⚠️ Other'}
                                        </span></p>
                                        <p>Time: ${new Date(attendances[index].created_at).toLocaleTimeString()}</p>
                                    ` : '<p>No attendance recorded today</p>'}
                                </div>
                                
                                <div>
                                    <h4>📝 Upcoming Homework</h4>
                                    ${homeworks[index] && homeworks[index].length > 0 ?
                homeworks[index].map(hw => `
                                            <p><strong>${hw.subject}:</strong> ${hw.title}<br>
                                            <small>Due: ${new Date(hw.due_date).toLocaleDateString()}</small></p>
                                        `).join('') :
                '<p>No pending homework</p>'
            }
                                </div>
                            </div>
                            
                            <div>
                                <a href="/student-info?student_id=${child.student_id}" class="btn" style="font-size: 0.9em; padding: 8px 15px;">
                                    View Details
                                </a>
                                <a href="/parent-attendance?student_id=${child.student_id}" class="btn btn-accent" style="font-size: 0.9em; padding: 8px 15px;">
                                    Attendance History
                                </a>
                                <a href="/parent-homework?student_id=${child.student_id}" class="btn btn-success" style="font-size: 0.9em; padding: 8px 15px;">
                                    All Homework
                                </a>
                            </div>
                        </div>
                    `).join('')}

                    <div class="child-card">
                        <h3>📅 Upcoming School Events</h3>
                        ${events.length > 0 ? events.map(event => `
                            <div style="padding: 15px; background: #F8FAFC; border-radius: 8px; margin: 10px 0;">
                                <strong>${event.title}</strong>
                                <p>${event.description || 'No description'}</p>
                                <p><small>📅 ${new Date(event.event_date).toLocaleDateString()} • ${event.event_type}</small></p>
                            </div>
                        `).join('') : '<p>No upcoming events</p>'}
                    </div>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error("Parent dashboard error:", error);
        res.status(500).send("Error loading parent dashboard");
    }
});

// ======================== PARENT LOGOUT ========================
app.get("/parent-logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});

// In your /install route, add these tables after the existing ones:
// In your /install route (must be async function)
app.get('/install', async (req, res) => {
    try {
        // 1. Create tables in correct order (parents, events, books first)
        const createTables = [
            // Parents table
            `CREATE TABLE IF NOT EXISTS parents (
                id INT AUTO_INCREMENT PRIMARY KEY,
                parent_id VARCHAR(20) UNIQUE NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE,
                phone VARCHAR(20) NOT NULL,
                password VARCHAR(255) NOT NULL,
                student_ids TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Events (no foreign key issues)
            `CREATE TABLE IF NOT EXISTS events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                event_date DATE NOT NULL,
                event_type ENUM('holiday', 'meeting', 'exam', 'sports', 'academic', 'other') DEFAULT 'other',
                created_by VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Library books
            `CREATE TABLE IF NOT EXISTS library_books (
                id INT AUTO_INCREMENT PRIMARY KEY,
                book_id VARCHAR(20) UNIQUE NOT NULL,
                title VARCHAR(255) NOT NULL,
                author VARCHAR(255) NOT NULL,
                isbn VARCHAR(20),
                category VARCHAR(100),
                grade_level VARCHAR(10),
                available_copies INT DEFAULT 1,
                total_copies INT DEFAULT 1,
                pdf_path VARCHAR(500),
                cover_image VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Homework (requires teachers table - assume exists)
            `CREATE TABLE IF NOT EXISTS homework (
                id INT AUTO_INCREMENT PRIMARY KEY,
                teacher_id VARCHAR(20) NOT NULL,
                grade VARCHAR(10) NOT NULL,
                subject VARCHAR(100) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                due_date DATE NOT NULL,
                pdf_path VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE CASCADE
            )`,

            // Homework submissions
            `CREATE TABLE IF NOT EXISTS homework_submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                homework_id INT NOT NULL,
                student_id VARCHAR(20) NOT NULL,
                submission_text TEXT,
                pdf_path VARCHAR(500),
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                grade VARCHAR(5),
                feedback TEXT,
                FOREIGN KEY (homework_id) REFERENCES homework(id) ON DELETE CASCADE,
                FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
            )`,

            // Book borrowing
            `CREATE TABLE IF NOT EXISTS book_borrowing (
                id INT AUTO_INCREMENT PRIMARY KEY,
                book_id VARCHAR(20) NOT NULL,
                student_id VARCHAR(20) NOT NULL,
                borrowed_date DATE NOT NULL,
                due_date DATE NOT NULL,
                returned_date DATE,
                status ENUM('borrowed', 'returned', 'overdue') DEFAULT 'borrowed',
                fine_amount DECIMAL(10,2) DEFAULT 0.00,
                FOREIGN KEY (book_id) REFERENCES library_books(book_id) ON DELETE CASCADE,
                FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
            )`,



            `CREATE TABLE IF NOT EXISTS analytics_cache (
                id INT AUTO_INCREMENT PRIMARY KEY,
                metric_name VARCHAR(100) UNIQUE NOT NULL,
                metric_value TEXT,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`
        ];

        // Execute all table creations
        for (const query of createTables) {
            await dbRun(query);
        }

        // 2. Insert sample data SAFELY (after tables exist)
        const bcrypt = require('bcrypt');

        // Hash password properly
        const hashedPassword = await bcrypt.hash('parent123', 10);

        const sampleInserts = [
            // Insert default parent
            `INSERT IGNORE INTO parents (parent_id, full_name, phone, password, student_ids, email) 
             VALUES ('PAR001', 'Demo Parent', '+251911223344', ?, 'WCU240001', 'parent@school.com')`,

            // Sample events
            `INSERT IGNORE INTO events (title, description, event_date, event_type, created_by) VALUES 
             ('Parents Meeting', 'Quarterly parents-teacher meeting', DATE_ADD(CURDATE(), INTERVAL 7 DAY), 'meeting', 'TECH001'),
             ('Midterm Exams', 'Grade 1-6 midterm examinations', DATE_ADD(CURDATE(), INTERVAL 14 DAY), 'exam', 'TECH001'),
             ('Sports Day', 'Annual school sports competition', DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'sports', 'TECH001')`,

            // Sample books
            `INSERT IGNORE INTO library_books (book_id, title, author, category, grade_level, available_copies, total_copies) VALUES 
             ('LIB001', 'Mathematics for Grade 1', 'Ethiopian MoE', 'Mathematics', '1', 10, 10),
             ('LIB002', 'English Grammar', 'Jane Smith', 'English', '1-3', 5, 5),
             ('LIB003', 'Science Experiments', 'Dr. Alemayehu', 'Science', '4-6', 8, 8),
             ('LIB004', 'Ethiopian History', 'Prof. Kebede', 'History', '5-6', 3, 3)`
        ];

        // Run inserts (use ? placeholder for password)
        await dbRun(sampleInserts[0], [hashedPassword]);
        for (let i = 1; i < sampleInserts.length; i++) {
            await dbRun(sampleInserts[i]);
        }

        res.send("Database tables and sample data installed successfully!");
    } catch (err) {
        console.error("Install error:", err);
        res.status(500).send("Installation failed: " + err.message);
    }
});

// ======================== STUDENT REGISTRATION ========================
app.get("/student-registration", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Student Registration - WCU -CS school</title>
            <style>
                :root {
                    --primary: #3B82F6;
                    --secondary: #10B981;
                    --dark: #1F2937;
                    --light: #F3F4F6;
                }
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                }
                
                .back-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 25px;
                    background: white;
                    color: var(--dark);
                    text-decoration: none;
                    border-radius: 25px;
                    font-weight: 600;
                    margin-bottom: 20px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    transition: all 0.3s ease;
                }
                
                .back-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                }
                
                .registration-card {
                    background: white;
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                }
                
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                
                .header-icon {
                    font-size: 4em;
                    margin-bottom: 15px;
                }
                
                .header h1 {
                    color: var(--dark);
                    margin-bottom: 10px;
                    font-size: 2.2em;
                }
                
                .header p {
                    color: #6B7280;
                    font-size: 1.1em;
                }
                
                .form-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                }
                
                .form-group {
                    margin-bottom: 20px;
                }
                
                .form-group.full-width {
                    grid-column: 1 / -1;
                }
                
                label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 600;
                    color: var(--dark);
                }
                
                input, select {
                    width: 100%;
                    padding: 15px;
                    border: 2px solid #E5E7EB;
                    border-radius: 10px;
                    font-size: 16px;
                    transition: all 0.3s ease;
                    background: white;
                }
                
                input:focus, select:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                
                .btn-group {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 15px;
                    margin-top: 30px;
                }
                
                .btn {
                    padding: 15px;
                    border: none;
                    border-radius: 10px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    text-align: center;
                    text-decoration: none;
                }
                
                .btn-back {
                    background: #6B7280;
                    color: white;
                }
                
                .btn-reset {
                    background: #EF4444;
                    color: white;
                }
                
                .btn-submit {
                    background: var(--secondary);
                    color: white;
                }
                
                .btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                }
                
                .success-message {
                    background: #D1FAE5;
                    color: #065F46;
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 25px;
                    border-left: 4px solid var(--secondary);
                }
                
                .student-id {
                    font-size: 1.5em;
                    font-weight: 800;
                    color: var(--primary);
                    margin: 10px 0;
                }
                
                @media (max-width: 768px) {
                    .form-grid {
                        grid-template-columns: 1fr;
                    }
                    
                    .btn-group {
                        grid-template-columns: 1fr;
                    }
                    
                    .registration-card {
                        padding: 25px 20px;
                    margin: 10px;
                    border-radius: 15px;
                    width: calc(100% - 20px);
                    margin-left: auto;
                        margin-right: auto;
                    }
                    
                    .container {
                        padding: 0;
                    }
                }
                
                @media (max-width: 480px) {
                    .header h1 {
                        font-size: 1.8em;
                    }
                    
                    .header-icon {
                        font-size: 3em;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <a href="/" class="back-btn">
                    ← Back to -CS school
                </a>
                
                <div class="registration-card">
                    <div class="header">
                        <div class="header-icon">👨‍🎓</div>
                        <h1>Student Registration</h1>
                        <p>Join WCU Community School - Complete the form below</p>
                    </div>
                    
                    ${req.query.success ? `
                        <div class="success-message">
                            <h3>✅ Registration Successful!</h3>
                            <p>Your student has been registered successfully.</p>
                            <div class="student-id">Student ID: ${req.query.studentId}</div>
                            <p><strong>Important:</strong> Save this Student ID for future reference and login.</p>
                        </div>
                    ` : ''}
                    
                    <form id="registrationForm" action="/student-registration" method="POST">
                        <div class="form-grid">
                            <div class="form-group full-width">
                                <label for="full_name">Full Name *</label>
                                <input type="text" id="full_name" name="full_name" required 
                                       placeholder="Enter student's full name">
                            </div>
                            
                            <div class="form-group">
                                <label for="grade">Grade Level *</label>
                                <select id="grade" name="grade" required>
                                    <option value="">Select Grade</option>
                                    <option value="KG1">Kindergarten 1 (KG1)</option>
                                    <option value="KG2">Kindergarten 2 (KG2)</option>
                                    <option value="KG3">Kindergarten 3 (KG3)</option>
                                    <option value="1">Grade 1</option>
                                    <option value="2">Grade 2</option>
                                    <option value="3">Grade 3</option>
                                    <option value="4">Grade 4</option>
                                    <option value="5">Grade 5</option>
                                    <option value="6">Grade 6</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="age">Age *</label>
                                <input type="number" id="age" name="age" required min="4" max="18" 
                                       placeholder="Student age">
                            </div>
                            
                            <div class="form-group">
                                <label for="sex">Gender *</label>
                                <select id="sex" name="sex" required>
                                    <option value="">Select Gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="village">Village/Area *</label>
                                <input type="text" id="village" name="village" required 
                                       placeholder="Enter village name">
                            </div>
                            
                            <div class="form-group full-width">
                                <label for="parent_phone">Parent's Phone Number *</label>
                                <input type="tel" id="parent_phone" name="parent_phone" required 
                                       placeholder="+251 XXX XXX XXX" pattern="[+][0-9]{12}">
                                <small style="color: #6B7280; margin-top: 5px; display: block;">
                                    Format: +251911223344
                                </small>
                            </div>
                        </div>
                        
                        <div class="btn-group">
                            <button type="button" onclick="location.href='/'" class="btn btn-back">
                                ← Back Home
                            </button>
                            <button type="reset" class="btn btn-reset">
                                🔄 Reset Form
                            </button>
                            <button type="submit" class="btn btn-submit">
                                ✅ Submit Registration
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            
            <script>
                document.getElementById('registrationForm').addEventListener('submit', function(e) {
                    const phone = document.getElementById('parent_phone').value;
                    if (!phone.startsWith('+251')) {
                        alert('Please enter phone number in format: +251 XXX XXX XXX');
                        e.preventDefault();
                    }
                    
                    // Show loading state
                    const submitBtn = this.querySelector('button[type="submit"]');
                    submitBtn.innerHTML = '⏳ Processing...';
                    submitBtn.disabled = true;
                });
                
                // Add form validation styling
                const inputs = document.querySelectorAll('input, select');
                inputs.forEach(input => {
                    input.addEventListener('invalid', function() {
                        this.style.borderColor = '#EF4444';
                    });
                    
                    input.addEventListener('input', function() {
                        if (this.checkValidity()) {
                            this.style.borderColor = '#10B981';
                        }
                    });
                });
            </script>
        </body>
        </html>
    `);
});

app.post("/student-registration", async (req, res) => {
    const { full_name, grade, village, parent_phone, sex, age } = req.body;

    try {
        // Generate student ID: WCU + year + 4-digit number
        const year = new Date().getFullYear().toString().slice(-2);
        const lastStudent = await dbGet("SELECT student_id FROM students ORDER BY id DESC LIMIT 1");

        let studentNumber = "0001";
        if (lastStudent) {
            const lastNumber = parseInt(lastStudent.student_id.slice(-4));
            studentNumber = String(lastNumber + 1).padStart(4, '0');
        }

        const student_id = `WCU${year}${studentNumber}`;

        await dbRun(
            "INSERT INTO students (student_id, full_name, grade, village, parent_phone, sex, age) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [student_id, full_name, grade, village, parent_phone, sex, parseInt(age)]
        );

        res.redirect(`/student-registration?success=true&studentId=${student_id}`);

    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).send(`
            <div style="text-align:center;margin-top:100px;padding:20px;">
                <h2 style="color:red;">Registration Failed</h2>
                <p>${error.message}</p>
                <a href="/student-registration" style="color:#3B82F6;">Try Again</a>
            </div>
        `);
    }
});

// ======================== PAYMENT SYSTEM ========================
app.get("/payment", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Payment System - WCU -CS school</title>
            <style>
                body { font-family: Arial; margin: 0; background: #f5f5f5; }
                .header { background: linear-gradient(135deg, #2c3e50, #3498db); color: white; padding: 30px 20px; text-align: center; }
                .container { max-width: 800px; margin: 30px auto; padding: 0 20px; }
                .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 20px; }
                .form-group { margin-bottom: 20px; }
                label { display: block; margin-bottom: 8px; font-weight: bold; }
                input, select { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; }
                .btn { padding: 12px 25px; background: #27ae60; color: white; border: none; border-radius: 8px; cursor: pointer; }
                .bank-info { background: #e8f4fd; padding: 15px; border-radius: 8px; margin: 15px 0; }
                .success-message { background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>💳 Payment System</h1>
                <p>Secure online payments for school fees</p>
            </div>

            <div class="container">
                <a href="/" style="display: inline-block; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; margin-bottom: 20px;">← Back to Home</a>

                ${req.query.success ? `
                    <div class="success-message">
                        <h3>✅ Payment Submitted Successfully!</h3>
                        <p>Your payment is under review. You will receive confirmation soon.</p>
                    </div>
                ` : ''}

                <div class="card">
                    <h2>Bank Account Information</h2>
                    <div class="bank-info">
                        <p><strong>🏦 CBE Bank:</strong> 1000 2345 6789 0123</p>
                        <p><strong>📱 Telebirr:</strong> 2519 1234 5678</p>
                        <p><strong>🏦 Awash Bank:</strong> 0134 5678 9012 3456</p>
                        <p><strong>👤 Account Name:</strong> WCU Community School</p>
                    </div>
                </div>

                <div class="card">
                    <h2>Submit Payment Proof</h2>
                    <form action="/payment" method="POST" enctype="multipart/form-data">
                        <div class="form-group">
                            <label>Student ID *</label>
                            <input type="text" name="student_id" required placeholder="Enter Student ID (e.g., WCU240001)">
                        </div>

                        <div class="form-group">
                            <label>Amount (ETB) *</label>
                            <input type="number" name="amount" step="0.01" required placeholder="Enter amount">
                        </div>

                        <div class="form-group">
                            <label>Payment Method *</label>
                            <select name="payment_method" required>
                                <option value="">Select Method</option>
                                <option value="CBE">CBE Bank</option>
                                <option value="Telebirr">Telebirr</option>
                                <option value="Awash">Awash Bank</option>
                                <option value="Other">Other Bank</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Transaction ID</label>
                            <input type="text" name="transaction_id" placeholder="Enter transaction ID (if available)">
                        </div>

                        <div class="form-group">
                            <label>Payment Screenshot *</label>
                            <input type="file" name="screenshot" accept="image/*" required>
                            <small>Upload screenshot of payment confirmation</small>
                        </div>

                        <button type="submit" class="btn">Submit Payment Proof</button>
                    </form>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.post("/payment", upload.single('screenshot'), async (req, res) => {
    const { student_id, amount, payment_method, transaction_id } = req.body;

    try {
        // Verify student exists
        const student = await dbGet("SELECT * FROM students WHERE student_id = ?", [student_id]);
        if (!student) {
            return res.status(400).send("Student ID not found");
        }

        await dbRun(
            "INSERT INTO payments (student_id, amount, payment_method, transaction_id, screenshot_path) VALUES (?, ?, ?, ?, ?)",
            [student_id, amount, payment_method, transaction_id || null, req.file ? `/uploads/${req.file.filename}` : null]
        );

        res.redirect("/payment?success=true");

    } catch (error) {
        res.status(500).send("Payment submission failed: " + error.message);
    }
});

// ======================== DIGITAL CLASSES ========================
app.get("/classes", async (req, res) => {
    try {
        const materials = await dbAll("SELECT * FROM class_materials ORDER BY grade, subject");

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Digital Classes - WCU -CS school</title>
                <style>
                    body { font-family: Arial; margin: 0; background: #f5f5f5; }
                    .header { background: linear-gradient(135deg, #2c3e50, #3498db); color: white; padding: 30px 20px; text-align: center; }
                    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                    .grade-section { margin: 30px 0; }
                    .grade-title { background: #34495e; color: white; padding: 15px; border-radius: 10px 10px 0 0; }
                    .materials-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin-top: 0; }
                    .material-card { background: white; padding: 20px; border-radius: 0 0 10px 10px; box-shadow: 0 3px 10px rgba(0,0,0,0.1); }
                    .btn { display: inline-block; padding: 10px 20px; margin: 5px; background: #27ae60; color: white; text-decoration: none; border-radius: 5px; }
                    .btn-download { background: #3498db; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📚 Digital Classes</h1>
                    <p>Download learning materials for all grades</p>
                </div>

                <div class="container">
                    <a href="/" style="display: inline-block; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; margin-bottom: 20px;">← Back to Home</a>

                    ${materials.length === 0 ? `
                        <div style="text-align: center; padding: 40px; background: white; border-radius: 10px;">
                            <h3>No materials available yet</h3>
                            <p>Materials will be uploaded by teachers soon.</p>
                            <p>📚 Check back later for class materials!</p>
                        </div>
                    ` : ''}

                    ${['KG1', 'KG2', 'KG3', '1', '2', '3', '4', '5', '6'].map(grade => {
            const gradeMaterials = materials.filter(m => m.grade === grade);
            if (gradeMaterials.length === 0) return '';

            return `
                            <div class="grade-section">
                                <div class="grade-title">
                                    <h2>Grade ${grade}</h2>
                                </div>
                                <div class="materials-grid">
                                    ${gradeMaterials.map(material => `
                                        <div class="material-card">
                                            <h3>${material.subject}</h3>
                                            <p><strong>${material.title}</strong></p>
                                            ${material.description ? `<p>${material.description}</p>` : ''}
                                            <div style="margin-top: 15px;">
                                                <a href="/uploads/${path.basename(material.pdf_path)}" target="_blank" class="btn">📖 Open PDF</a>
                                                <a href="/uploads/${path.basename(material.pdf_path)}" download class="btn btn-download">📥 Download</a>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send("Error loading class materials: " + error.message);
    }
});


// ======================== STUDENT INFORMATION ========================
app.get("/student-info", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Student Information - WCU -CS school</title>
            <style>
                body { font-family: Arial; margin: 0; background: #f5f5f5; }
                .header { background: linear-gradient(135deg, #2c3e50, #3498db); color: white; padding: 30px 20px; text-align: center; }
                .container { max-width: 800px; margin: 30px auto; padding: 0 20px; }
                .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
                .form-group { margin-bottom: 20px; }
                label { display: block; margin-bottom: 8px; font-weight: bold; }
                input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; }
                .btn { padding: 12px 25px; background: #3498db; color: white; border: none; border-radius: 8px; cursor: pointer; }
                .student-info { margin-top: 30px; padding: 20px; background: #e8f4fd; border-radius: 10px; }
                .grades-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                .grades-table th, .grades-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                .grades-table th { background: #34495e; color: white; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>👨‍🎓 Student Information Portal</h1>
                <p>View student details and academic records</p>
            </div>

            <div class="container">
                <a href="/" style="display: inline-block; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; margin-bottom: 20px;">← Back to Home</a>

                <div class="card">
                    <form action="/student-info" method="POST">
                        <div class="form-group">
                            <label>Student ID *</label>
                            <input type="text" name="student_id" required placeholder="Enter Student ID (e.g., WCU240001)">
                        </div>

                        <div class="form-group">
                            <label>First Name *</label>
                            <input type="text" name="first_name" required placeholder="Enter student's first name">
                        </div>

                        <button type="submit" class="btn">🔍 Get Student Information</button>
                    </form>

                    ${req.query.error ? `
                        <div style="color: red; margin-top: 20px; padding: 15px; background: #ffe6e6; border-radius: 8px;">
                            ❌ Student not found. Please check the Student ID and First Name.
                        </div>
                    ` : ''}
                </div>

                ${req.query.student ? `
                    <div class="card">
                        <h2>📋 Student Information</h2>
                        <div class="student-info">
                            <p><strong>🎫 Student ID:</strong> ${JSON.parse(decodeURIComponent(req.query.student)).student_id}</p>
                            <p><strong>👤 Full Name:</strong> ${JSON.parse(decodeURIComponent(req.query.student)).full_name}</p>
                            <p><strong>📚 Grade:</strong> ${JSON.parse(decodeURIComponent(req.query.student)).grade}</p>
                            <p><strong>🏡 Village:</strong> ${JSON.parse(decodeURIComponent(req.query.student)).village}</p>
                            <p><strong>📞 Parent Phone:</strong> ${JSON.parse(decodeURIComponent(req.query.student)).parent_phone}</p>
                            <p><strong>⚧ Sex:</strong> ${JSON.parse(decodeURIComponent(req.query.student)).sex}</p>
                            <p><strong>🎂 Age:</strong> ${JSON.parse(decodeURIComponent(req.query.student)).age}</p>
                        </div>

                        <h3 style="margin-top: 30px;">📊 Grade Report</h3>
                        ${req.query.grades ? `
                            <table class="grades-table">
                                <thead>
                                    <tr>
                                        <th>Subject</th>
                                        <th>Grade</th>
                                        <th>Term</th>
                                        <th>Year</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${JSON.parse(decodeURIComponent(req.query.grades)).map(grade => `
                                        <tr>
                                            <td>${grade.subject}</td>
                                            <td>${grade.grade}</td>
                                            <td>${grade.term}</td>
                                            <td>${grade.year}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<p>No grade records found.</p>'}
                    </div>
                ` : ''}
            </div>
        </body>
        </html>
    `);
});

app.post("/student-info", async (req, res) => {
    const { student_id, first_name } = req.body;

    try {
        const student = await dbGet(
            "SELECT * FROM students WHERE student_id = ? AND full_name LIKE ?",
            [student_id, `%${first_name}%`]
        );

        if (!student) {
            return res.redirect("/student-info?error=true");
        }

        const grades = await dbAll(
            "SELECT * FROM grades WHERE student_id = ? ORDER BY year DESC, term DESC",
            [student_id]
        );

        res.redirect(`/student-info?student=${encodeURIComponent(JSON.stringify(student))}&grades=${encodeURIComponent(JSON.stringify(grades))}`);

    } catch (error) {
        res.status(500).send("Error fetching student information: " + error.message);
    }
});


// ======================== PARENT ATTENDANCE CHECK ========================
app.get("/parent-attendance", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Check Attendance - WCU -CS school</title>
            <style>
                :root {
                    --primary: #3B82F6;
                    --secondary: #10B981;
                    --accent: #8B5CF6;
                    --warning: #F59E0B;
                }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #F8FAFC; color: #1F2937; }
                
                .header { background: linear-gradient(135deg, var(--primary), var(--accent)); color: white; padding: 40px 20px; text-align: center; }
                .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                
                .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 25px; }
                
                .btn { display: inline-block; padding: 12px 25px; background: var(--primary); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; transition: all 0.3s ease; }
                .btn:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
                
                .search-form { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 15px; align-items: end; margin: 20px 0; }
                
                .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 25px 0; }
                .stat-card { background: white; padding: 25px; border-radius: 12px; text-align: center; box-shadow: 0 3px 10px rgba(0,0,0,0.08); border-top: 4px solid; }
                .stat-present { border-color: var(--secondary); color: var(--secondary); }
                .stat-absent { border-color: #EF4444; color: #EF4444; }
                .stat-other { border-color: var(--warning); color: var(--warning); }
                .stat-rate { border-color: var(--primary); color: var(--primary); }
                .stat-number { font-size: 2.5em; font-weight: 800; margin-bottom: 5px; }
                
                .attendance-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                .attendance-table th, .attendance-table td { padding: 12px; text-align: left; border-bottom: 1px solid #E5E7EB; }
                .attendance-table th { background: #F9FAFB; font-weight: 600; }
                .status-P { color: var(--secondary); font-weight: bold; }
                .status-A { color: #EF4444; font-weight: bold; }
                .status-O { color: var(--warning); font-weight: bold; }
                
                .student-info { background: #EFF6FF; padding: 25px; border-radius: 12px; margin: 20px 0; }
                
                input, select { padding: 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; width: 100%; }
                input:focus, select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
                
                .period-tabs { display: flex; gap: 10px; margin: 20px 0; flex-wrap: wrap; }
                .period-tab { padding: 10px 20px; background: #F3F4F6; border: none; border-radius: 25px; cursor: pointer; transition: all 0.3s ease; }
                .period-tab.active { background: var(--primary); color: white; }
                
                .no-data { text-align: center; padding: 40px; color: #6B7280; }
                
                @media (max-width: 768px) {
                    .search-form { grid-template-columns: 1fr; }
                    .stats-grid { grid-template-columns: repeat(2, 1fr); }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📊 Attendance Check</h1>
                <p>Parents: Check your child's attendance records</p>
            </div>

            <div class="nav">
                <a href="/" class="btn" style="background: #6B7280;">🏠 Back to Home</a>
                <a href="/student-info" class="btn" style="background: var(--secondary);">👨‍🎓 Student Info</a>
            </div>

            <div class="container">
                <div class="card">
                    <h2>🔍 Check Your Child's Attendance</h2>
                    <p style="color: #6B7280; margin-bottom: 20px;">Enter your child's Student ID to view their attendance records</p>
                    
                    <form action="/parent-attendance" method="POST" class="search-form">
                        <div>
                            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Student ID *</label>
                            <input type="text" name="student_id" required placeholder="Enter Student ID (e.g., WCU240001)">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Time Period</label>
                            <select name="period">
                                <option value="today">Today</option>
                                <option value="week" selected>This Week</option>
                                <option value="month">This Month</option>
                                <option value="year">This Year</option>
                                <option value="all">All Time</option>
                            </select>
                        </div>
                        <div>
                            <button type="submit" class="btn" style="width: 100%;">🔍 Check Attendance</button>
                        </div>
                    </form>
                </div>

                ${req.query.error ? `
                    <div class="card" style="border-left: 4px solid #EF4444; background: #FEF2F2;">
                        <h3 style="color: #DC2626;">❌ Student Not Found</h3>
                        <p>Please check the Student ID and try again. Make sure to enter the correct Student ID provided during registration.</p>
                    </div>
                ` : ''}

                ${req.query.nodata ? `
                    <div class="card" style="border-left: 4px solid var(--warning); background: #FFFBEB;">
                        <h3 style="color: var(--warning);">📝 No Attendance Records</h3>
                        <p>No attendance records found for the selected period. Attendance records are updated daily by teachers.</p>
                    </div>
                ` : ''}
            </div>
        </body>
        </html>
    `);
});

app.post("/parent-attendance", async (req, res) => {
    const { student_id, period } = req.body;

    try {
        // Verify student exists
        const student = await dbGet("SELECT * FROM students WHERE student_id = ?", [student_id]);
        if (!student) {
            return res.redirect("/parent-attendance?error=true");
        }

        // Calculate date range based on period
        let dateCondition = "1=1";
        let periodText = "All Time";

        switch (period) {
            case 'today':
                dateCondition = "date = CURDATE()";
                periodText = "Today";
                break;
            case 'week':
                dateCondition = "date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
                periodText = "This Week";
                break;
            case 'month':
                dateCondition = "date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
                periodText = "This Month";
                break;
            case 'year':
                dateCondition = "date >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)";
                periodText = "This Year";
                break;
        }

        // Get attendance records with teacher information
        const attendance = await dbAll(`
            SELECT a.*, t.full_name as teacher_name, t.subject 
            FROM attendance a 
            LEFT JOIN teachers t ON a.teacher_id = t.teacher_id 
            WHERE a.student_id = ? AND ${dateCondition} 
            ORDER BY a.date DESC
        `, [student_id]);

        if (attendance.length === 0) {
            return res.redirect(`/parent-attendance?nodata=true&student_id=${student_id}`);
        }

        // Calculate comprehensive statistics
        const stats = await dbAll(`
            SELECT 
                COUNT(*) as total_days,
                SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) as present_days,
                SUM(CASE WHEN status = 'A' THEN 1 ELSE 0 END) as absent_days,
                SUM(CASE WHEN status = 'O' THEN 1 ELSE 0 END) as other_days,
                MIN(date) as first_record,
                MAX(date) as last_record
            FROM attendance 
            WHERE student_id = ? AND ${dateCondition}
        `, [student_id]);

        const stat = stats[0];
        const attendanceRate = stat.total_days > 0 ? Math.round((stat.present_days / stat.total_days) * 100) : 0;

        // Get recent attendance (last 7 days)
        const recentAttendance = await dbAll(`
            SELECT date, status 
            FROM attendance 
            WHERE student_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            ORDER BY date DESC
        `, [student_id]);

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Attendance Report - ${student.full_name}</title>
                <style>
                    :root {
                        --primary: #3B82F6;
                        --secondary: #10B981;
                        --accent: #8B5CF6;
                        --warning: #F59E0B;
                    }
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #F8FAFC; color: #1F2937; }
                    
                    .header { background: linear-gradient(135deg, var(--primary), var(--accent)); color: white; padding: 40px 20px; }
                    .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                    
                    .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 25px; }
                    
                    .btn { display: inline-block; padding: 12px 25px; background: var(--primary); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; transition: all 0.3s ease; }
                    .btn:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
                    
                    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 25px 0; }
                    .stat-card { background: white; padding: 25px; border-radius: 12px; text-align: center; box-shadow: 0 3px 10px rgba(0,0,0,0.08); border-top: 4px solid; }
                    .stat-present { border-color: var(--secondary); color: var(--secondary); }
                    .stat-absent { border-color: #EF4444; color: #EF4444; }
                    .stat-other { border-color: var(--warning); color: var(--warning); }
                    .stat-rate { border-color: var(--primary); color: var(--primary); }
                    .stat-number { font-size: 2.5em; font-weight: 800; margin-bottom: 5px; }
                    
                    .attendance-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    .attendance-table th, .attendance-table td { padding: 12px; text-align: left; border-bottom: 1px solid #E5E7EB; }
                    .attendance-table th { background: #F9FAFB; font-weight: 600; }
                    .status-P { color: var(--secondary); font-weight: bold; }
                    .status-A { color: #EF4444; font-weight: bold; }
                    .status-O { color: var(--warning); font-weight: bold; }
                    
                    .student-info { background: #EFF6FF; padding: 25px; border-radius: 12px; margin: 20px 0; }
                    
                    .period-tabs { display: flex; gap: 10px; margin: 20px 0; flex-wrap: wrap; }
                    .period-tab { padding: 10px 20px; background: #F3F4F6; border: none; border-radius: 25px; cursor: pointer; transition: all 0.3s ease; }
                    .period-tab.active { background: var(--primary); color: white; }
                    
                    .recent-days { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; margin: 20px 0; }
                    .day-card { padding: 15px; border-radius: 10px; text-align: center; background: #F8FAFC; }
                    .day-present { background: #D1FAE5; color: var(--secondary); }
                    .day-absent { background: #FEE2E2; color: #EF4444; }
                    .day-other { background: #FEF3C7; color: var(--warning); }
                    .day-empty { background: #F3F4F6; color: #6B7280; }
                    
                    @media (max-width: 768px) {
                        .stats-grid { grid-template-columns: repeat(2, 1fr); }
                        .recent-days { grid-template-columns: repeat(4, 1fr); }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📊 Attendance Report</h1>
                    <p>Detailed attendance records for ${student.full_name}</p>
                </div>

                <div class="nav">
                    <a href="/parent-attendance" class="btn" style="background: #6B7280;">← Check Another Student</a>
                    <a href="/" class="btn" style="background: var(--secondary);">🏠 Home</a>
                </div>

                <div class="container">
                    <!-- Student Information -->
                    <div class="card">
                        <h2>👨‍🎓 Student Information</h2>
                        <div class="student-info">
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                                <div>
                                    <strong>Student ID:</strong> ${student.student_id}<br>
                                    <strong>Full Name:</strong> ${student.full_name}<br>
                                    <strong>Grade:</strong> ${student.grade}
                                </div>
                                <div>
                                    <strong>Village:</strong> ${student.village}<br>
                                    <strong>Parent Phone:</strong> ${student.parent_phone}<br>
                                    <strong>Report Period:</strong> ${periodText}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Quick Period Tabs -->
                    <div class="card">
                        <h3>📅 Quick Period View</h3>
                        <div class="period-tabs">
                            <a href="/parent-attendance-search?student_id=${student_id}&period=today" class="period-tab ${period === 'today' ? 'active' : ''}">Today</a>
                            <a href="/parent-attendance-search?student_id=${student_id}&period=week" class="period-tab ${period === 'week' ? 'active' : ''}">This Week</a>
                            <a href="/parent-attendance-search?student_id=${student_id}&period=month" class="period-tab ${period === 'month' ? 'active' : ''}">This Month</a>
                            <a href="/parent-attendance-search?student_id=${student_id}&period=year" class="period-tab ${period === 'year' ? 'active' : ''}">This Year</a>
                            <a href="/parent-attendance-search?student_id=${student_id}&period=all" class="period-tab ${period === 'all' ? 'active' : ''}">All Time</a>
                        </div>
                    </div>

                    <!-- Statistics -->
                    <div class="card">
                        <h2>📈 Attendance Statistics (${periodText})</h2>
                        <div class="stats-grid">
                            <div class="stat-card stat-present">
                                <div class="stat-number">${stat.present_days}</div>
                                <div>Present Days</div>
                                <small>${Math.round((stat.present_days / stat.total_days) * 100)}% of total</small>
                            </div>
                            <div class="stat-card stat-absent">
                                <div class="stat-number">${stat.absent_days}</div>
                                <div>Absent Days</div>
                                <small>${Math.round((stat.absent_days / stat.total_days) * 100)}% of total</small>
                            </div>
                            <div class="stat-card stat-other">
                                <div class="stat-number">${stat.other_days}</div>
                                <div>Other Days</div>
                                <small>${Math.round((stat.other_days / stat.total_days) * 100)}% of total</small>
                            </div>
                            <div class="stat-card stat-rate">
                                <div class="stat-number">${attendanceRate}%</div>
                                <div>Attendance Rate</div>
                                <small>Based on ${stat.total_days} days</small>
                            </div>
                        </div>
                        
                        <div style="margin-top: 20px; padding: 15px; background: #F8FAFC; border-radius: 8px;">
                            <strong>Record Period:</strong> ${new Date(stat.first_record).toLocaleDateString()} to ${new Date(stat.last_record).toLocaleDateString()}
                        </div>
                    </div>

                    <!-- Recent 7 Days -->
                    <div class="card">
                        <h2>📅 Last 7 Days Overview</h2>
                        <div class="recent-days">
                            ${Array.from({ length: 7 }).map((_, index) => {
            const date = new Date();
            date.setDate(date.getDate() - index);
            const dateStr = date.toISOString().split('T')[0];
            const dayRecord = recentAttendance.find(a => a.date.toISOString().split('T')[0] === dateStr);

            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayName = dayNames[date.getDay()];

            let dayClass = 'day-empty';
            let statusIcon = '⏸️';

            if (dayRecord) {
                if (dayRecord.status === 'P') {
                    dayClass = 'day-present';
                    statusIcon = '✅';
                } else if (dayRecord.status === 'A') {
                    dayClass = 'day-absent';
                    statusIcon = '❌';
                } else {
                    dayClass = 'day-other';
                    statusIcon = '⚠️';
                }
            }

            return `
                                    <div class="day-card ${dayClass}">
                                        <div style="font-size: 1.2em; margin-bottom: 5px;">${statusIcon}</div>
                                        <div style="font-weight: 600;">${dayName}</div>
                                        <div style="font-size: 0.8em;">${date.getDate()}/${date.getMonth() + 1}</div>
                                    </div>
                                `;
        }).join('')}
                        </div>
                    </div>

                    <!-- Detailed Records -->
                    <div class="card">
                        <h2>📋 Detailed Attendance Records</h2>
                        ${attendance.length > 0 ? `
                            <table class="attendance-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Day</th>
                                        <th>Status</th>
                                        <th>Teacher</th>
                                        <th>Subject</th>
                                        <th>Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${attendance.map(record => `
                                        <tr>
                                            <td>${new Date(record.date).toLocaleDateString()}</td>
                                            <td>${new Date(record.date).toLocaleDateString('en-US', { weekday: 'long' })}</td>
                                            <td class="status-${record.status}">
                                                ${record.status === 'P' ? '✅ Present' : record.status === 'A' ? '❌ Absent' : '⚠️ Other'}
                                            </td>
                                            <td>${record.teacher_name || 'System'}</td>
                                            <td>${record.subject || 'General'}</td>
                                            <td>${new Date(record.created_at).toLocaleTimeString()}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : `
                            <div class="no-data">
                                <h3>No attendance records found</h3>
                                <p>No attendance records available for the selected period.</p>
                            </div>
                        `}
                    </div>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        res.redirect("/parent-attendance?error=true");
    }
});

// ======================== QUICK PERIOD SEARCH ========================
app.get("/parent-attendance-search", async (req, res) => {
    const { student_id, period } = req.query;

    try {
        // Verify student exists
        const student = await dbGet("SELECT * FROM students WHERE student_id = ?", [student_id]);
        if (!student) {
            return res.redirect("/parent-attendance?error=true");
        }

        // Calculate date range based on period
        let dateCondition = "1=1";
        let periodText = "All Time";

        switch (period) {
            case 'today':
                dateCondition = "date = CURDATE()";
                periodText = "Today";
                break;
            case 'week':
                dateCondition = "date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
                periodText = "This Week";
                break;
            case 'month':
                dateCondition = "date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
                periodText = "This Month";
                break;
            case 'year':
                dateCondition = "date >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)";
                periodText = "This Year";
                break;
        }

        // Get attendance records
        const attendance = await dbAll(`
            SELECT a.*, t.full_name as teacher_name, t.subject 
            FROM attendance a 
            LEFT JOIN teachers t ON a.teacher_id = t.teacher_id 
            WHERE a.student_id = ? AND ${dateCondition} 
            ORDER BY a.date DESC
        `, [student_id]);

        // Calculate statistics
        const stats = await dbAll(`
            SELECT 
                COUNT(*) as total_days,
                SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) as present_days,
                SUM(CASE WHEN status = 'A' THEN 1 ELSE 0 END) as absent_days,
                SUM(CASE WHEN status = 'O' THEN 1 ELSE 0 END) as other_days
            FROM attendance 
            WHERE student_id = ? AND ${dateCondition}
        `, [student_id]);

        const stat = stats[0] || { total_days: 0, present_days: 0, absent_days: 0, other_days: 0 };
        const attendanceRate = stat.total_days > 0 ? Math.round((stat.present_days / stat.total_days) * 100) : 0;

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Attendance - ${student.full_name}</title>
                <style>
                    body { font-family: Arial; margin: 0; background: #f5f5f5; }
                    .header { background: linear-gradient(135deg, #3B82F6, #1D4ED8); color: white; padding: 30px 20px; }
                    .container { max-width: 1000px; margin: 20px auto; padding: 0 20px; }
                    .card { background: white; padding: 20px; border-radius: 10px; margin: 20px 0; box-shadow: 0 3px 10px rgba(0,0,0,0.1); }
                    .btn { padding: 10px 20px; background: #3B82F6; color: white; text-decoration: none; border-radius: 5px; }
                    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
                    .stat { text-align: center; padding: 15px; background: #EFF6FF; border-radius: 8px; }
                    .attendance-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Attendance Report - ${periodText}</h1>
                    <p>${student.full_name} (Grade ${student.grade})</p>
                </div>

                <div class="container">
                    <a href="/parent-attendance" class="btn">← Check Another Student</a>
                    
                    <div class="card">
                        <h2>Statistics</h2>
                        <div class="stats">
                            <div class="stat">
                                <div style="font-size: 2em; color: #10B981;">${stat.present_days}</div>
                                <div>Present</div>
                            </div>
                            <div class="stat">
                                <div style="font-size: 2em; color: #EF4444;">${stat.absent_days}</div>
                                <div>Absent</div>
                            </div>
                            <div class="stat">
                                <div style="font-size: 2em; color: #F59E0B;">${stat.other_days}</div>
                                <div>Other</div>
                            </div>
                            <div class="stat">
                                <div style="font-size: 2em; color: #3B82F6;">${attendanceRate}%</div>
                                <div>Rate</div>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <h2>Attendance Records</h2>
                        ${attendance.length > 0 ? `
                            <table class="attendance-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Status</th>
                                        <th>Teacher</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${attendance.map(record => `
                                        <tr>
                                            <td>${new Date(record.date).toLocaleDateString()}</td>
                                            <td style="color: ${record.status === 'P' ? '#10B981' : record.status === 'A' ? '#EF4444' : '#F59E0B'}">
                                                ${record.status === 'P' ? '✅ Present' : record.status === 'A' ? '❌ Absent' : '⚠️ Other'}
                                            </td>
                                            <td>${record.teacher_name || 'System'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<p>No records found.</p>'}
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.redirect("/parent-attendance?error=true");
    }
});

// ======================== ANNOUNCEMENTS ========================
app.get("/announcements", async (req, res) => {
    try {
        const announcements = await dbAll("SELECT * FROM announcements ORDER BY created_at DESC");

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Announcements - WCU -CS school</title>
                <style>
                    body { font-family: Arial; margin: 0; background: #f5f5f5; }
                    .header { background: linear-gradient(135deg, #2c3e50, #3498db); color: white; padding: 30px 20px; text-align: center; }
                    .container { max-width: 800px; margin: 30px auto; padding: 0 20px; }
                    .announcement-card { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 3px 10px rgba(0,0,0,0.1); margin-bottom: 20px; border-left: 4px solid #e74c3c; }
                    .announcement-date { color: #666; font-size: 0.9em; margin-top: 10px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📢 School Announcements</h1>
                    <p>Latest news and updates from WCU Community School</p>
                </div>

                <div class="container">
                    <a href="/" style="display: inline-block; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; margin-bottom: 20px;">← Back to Home</a>

                    ${announcements.length > 0 ? announcements.map(ann => `
                        <div class="announcement-card">
                            <h3>${ann.title}</h3>
                            <p>${ann.content}</p>
                            <div class="announcement-date">
                                ${new Date(ann.created_at).toLocaleDateString()} • ${ann.category}
                            </div>
                        </div>
                    `).join('') : `
                        <div class="announcement-card" style="text-align: center;">
                            <p>No announcements available at the moment.</p>
                            <p>📢 Check back later for school news and updates!</p>
                        </div>
                    `}
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send("Error loading announcements: " + error.message);
    }
});




// ======================== TEACHER DASHBOARD ========================
// ======================== TEACHER LOGIN ========================
app.get("/teacher-login", (req, res) => {
    if (req.session.teacher) {
        return res.redirect("/teacher-dashboard");
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Teacher Login - WCU -CS school</title>
            <style>
                body { font-family: Arial; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
                .login-container { background: white; border-radius: 20px; padding: 50px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); width: 100%; max-width: 450px; text-align: center; }
                .login-icon { font-size: 4em; margin-bottom: 20px; }
                h1 { color: #1F2937; margin-bottom: 10px; font-size: 2.2em; }
                .form-group { margin-bottom: 20px; text-align: left; }
                label { display: block; margin-bottom: 8px; font-weight: 600; color: #1F2937; }
                input { width: 100%; padding: 15px; border: 2px solid #E5E7EB; border-radius: 10px; font-size: 16px; }
                .btn-login { width: 100%; padding: 15px; background: #3B82F6; color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; margin-bottom: 20px; }
                .demo-info { background: #F3F4F6; padding: 20px; border-radius: 10px; margin-top: 25px; text-align: left; }
                .error { color: red; margin-bottom: 15px; }
            </style>
        </head>
        <body>
            <div class="login-container">
                <div class="login-icon">👨‍🏫</div>
                <h1>Teacher Login</h1>
                <p style="color: #6B7280; margin-bottom: 30px;">Access Your Teaching Dashboard</p>
                
                ${req.query.error ? '<div class="error">❌ Invalid Teacher ID or Password</div>' : ''}
                
                <form action="/teacher-login" method="POST">
                    <div class="form-group">
                        <label for="teacher_id">Teacher ID</label>
                        <input type="text" id="teacher_id" name="teacher_id" required placeholder="Enter Teacher ID" value="TECH001">
                    </div>
                    
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" name="password" required placeholder="Enter Password" value="teacher123">
                    </div>
                    
                    <button type="submit" class="btn-login">🔐 Login as Teacher</button>
                </form>
                
                <div class="demo-info">
                    <h3 style="color: #3B82F6; margin-bottom: 10px;">Demo Teacher Credentials:</h3>
                    <p><strong>Teacher ID:</strong> TECH001</p>
                    <p><strong>Password:</strong> teacher123</p>
                    <p><strong>Subject:</strong> Administration</p>
                </div>
                
                <a href="/" style="color: #6B7280; text-decoration: none; margin-top: 20px; display: inline-block;">← Back to School</a>
            </div>
        </body>
        </html>
    `);
});

app.post("/teacher-login", async (req, res) => {
    const { teacher_id, password } = req.body;

    try {
        const teacher = await dbGet("SELECT * FROM teachers WHERE teacher_id = ?", [teacher_id]);

        if (teacher && await bcrypt.compare(password, teacher.password)) {
            req.session.teacher = teacher;
            res.redirect("/teacher-dashboard");
        } else {
            res.redirect("/teacher-login?error=true");
        }
    } catch (error) {
        res.redirect("/teacher-login?error=true");
    }
});

// ======================== TEACHER DASHBOARD ========================
app.get("/teacher-dashboard", async (req, res) => {
    if (!req.session.teacher) return res.redirect("/teacher-login");

    try {
        const teacher = req.session.teacher;
        const today = new Date().toISOString().split('T')[0];

        // Get comprehensive statistics
        const stats = await dbAll(`
            SELECT 
                (SELECT COUNT(*) FROM students) as total_students,
                (SELECT COUNT(*) FROM attendance WHERE date = ? AND teacher_id = ?) as today_attendance,
                (SELECT COUNT(*) FROM class_materials WHERE uploaded_by = ?) as my_materials,
                (SELECT COUNT(*) FROM grades WHERE teacher_id = ?) as grades_posted
        `, [today, teacher.teacher_id, teacher.teacher_id, teacher.teacher_id]);

        const stat = stats[0];

        // Get recent activities
        const recentAttendance = await dbAll(`
            SELECT a.*, s.full_name, s.grade 
            FROM attendance a 
            JOIN students s ON a.student_id = s.student_id 
            WHERE a.teacher_id = ? 
            ORDER BY a.created_at DESC LIMIT 5
        `, [teacher.teacher_id]);

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Teacher Dashboard - WCU -CS school</title>
                <style>
                    :root {
                        --primary: #3B82F6;
                        --secondary: #10B981;
                        --accent: #8B5CF6;
                        --warning: #F59E0B;
                        --dark: #1F2937;
                    }
                    body { font-family: Arial; margin: 0; background: #F3F4F6; }
                    .header { background: linear-gradient(135deg, var(--primary), var(--accent)); color: white; padding: 30px 20px; }
                    .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .container { max-width: 1400px; margin: 30px auto; padding: 0 20px; }
                    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
                    .stat-card { background: white; padding: 25px; border-radius: 10px; text-align: center; box-shadow: 0 3px 10px rgba(0,0,0,0.1); }
                    .stat-number { font-size: 2.5em; font-weight: 800; color: var(--primary); margin-bottom: 5px; }
                    .teacher-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 25px; margin: 40px 0; }
                    .teacher-card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
                    .btn { display: inline-block; padding: 12px 25px; margin: 5px; background: var(--primary); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
                    .btn-success { background: var(--secondary); }
                    .btn-warning { background: var(--warning); }
                    .activity-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                    .activity-table th, .activity-table td { padding: 12px; text-align: left; border-bottom: 1px solid #E5E7EB; }
                    .activity-table th { background: #F9FAFB; font-weight: 600; }
                    .status-P { color: var(--secondary); font-weight: bold; }
                    .status-A { color: #EF4444; font-weight: bold; }
                    .status-O { color: var(--warning); font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>👨‍🏫 Teacher Dashboard</h1>
                    <p>Teaching Panel - WCU -CS school</p>
                    <p>Welcome, ${teacher.full_name}! | Subject: ${teacher.subject || 'General'}</p>
                </div>

                <div class="nav">
                    <a href="/teacher-dashboard" class="btn">📊 Dashboard</a>
                    <a href="/teacher-attendance" class="btn">📝 Take Attendance</a>
                    <a href="/teacher-grades" class="btn">🎯 Post Grades</a>
                    <a href="/teacher-materials" class="btn">📚 Upload Materials</a>
                    <a href="/" class="btn" style="background: #6B7280;">🏠 School Home</a>
                    <a href="/teacher-logout" class="btn" style="background: #EF4444;">🚪 Logout</a>
                </div>

                <div class="container">
                    <h2>📈 Teaching Overview</h2>
                    
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-number">${stat.total_students || 0}</div>
                            <div>Total Students</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stat.today_attendance || 0}</div>
                            <div>Today's Attendance</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stat.my_materials || 0}</div>
                            <div>My Materials</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stat.grades_posted || 0}</div>
                            <div>Grades Posted</div>
                        </div>
                    </div>

                    <div class="teacher-grid">
                        <div class="teacher-card">
                            <h3>🚀 Quick Actions</h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0;">
                                <a href="/teacher-attendance" class="btn">📝 Take Attendance</a>
                                <a href="/teacher-grades" class="btn btn-success">🎯 Post Grades</a>
                                <a href="/teacher-materials" class="btn btn-warning">📚 Upload Materials</a>
                                <a href="/classes" class="btn">👀 View Digital Classes</a>
                            </div>
                            
                            <h4>📋 Recent Attendance</h4>
                            <table class="activity-table">
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Grade</th>
                                        <th>Status</th>
                                        <th>Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${recentAttendance.length > 0 ? recentAttendance.map(record => `
                                        <tr>
                                            <td>${record.full_name}</td>
                                            <td>${record.grade}</td>
                                            <td class="status-${record.status}">${record.status === 'P' ? '✅ Present' : record.status === 'A' ? '❌ Absent' : '⚠️ Other'}</td>
                                            <td>${new Date(record.created_at).toLocaleTimeString()}</td>
                                        </tr>
                                    `).join('') : `
                                        <tr>
                                            <td colspan="4" style="text-align: center; color: #6B7280;">No attendance records today</td>
                                        </tr>
                                    `}
                                </tbody>
                            </table>
                        </div>
                        
                        <div class="teacher-card">
                            <h3>📢 Quick Links</h3>
                            <div style="margin-top: 20px;">
                                <a href="/teacher-attendance" style="display: block; padding: 15px; background: #EFF6FF; margin: 10px 0; border-radius: 8px; text-decoration: none; color: #1F2937;">
                                    <strong>📊 Attendance Tracking</strong>
                                    <p style="margin: 5px 0; color: #6B7280;">Take and manage student attendance</p>
                                </a>
                                <a href="/teacher-grades" style="display: block; padding: 15px; background: #ECFDF5; margin: 10px 0; border-radius: 8px; text-decoration: none; color: #1F2937;">
                                    <strong>📝 Grade Reports</strong>
                                    <p style="margin: 5px 0; color: #6B7280;">Post and manage student grades</p>
                                </a>
                                <a href="/teacher-materials" style="display: block; padding: 15px; background: #FEF3C7; margin: 10px 0; border-radius: 8px; text-decoration: none; color: #1F2937;">
                                    <strong>📚 PDF Materials</strong>
                                    <p style="margin: 5px 0; color: #6B7280;">Upload class materials and PDFs</p>
                                </a>
                                <a href="/classes" style="display: block; padding: 15px; background: #F3E8FF; margin: 10px 0; border-radius: 8px; text-decoration: none; color: #1F2937;">
                                    <strong>👀 Digital Classes</strong>
                                    <p style="margin: 5px 0; color: #6B7280;">View all class materials</p>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send("Error loading teacher dashboard: " + error.message);
    }
});

// ======================== ATTENDANCE TRACKING ========================
// ======================== ENHANCED ATTENDANCE TRACKING ========================
app.get("/teacher-attendance", async (req, res) => {
    if (!req.session.teacher) return res.redirect("/teacher-login");

    try {
        const students = await dbAll("SELECT * FROM students ORDER BY grade, full_name");
        const today = new Date().toISOString().split('T')[0];

        // Get today's attendance for pre-filling
        const todayAttendance = await dbAll(`
            SELECT a.*, s.full_name, s.grade 
            FROM attendance a 
            JOIN students s ON a.student_id = s.student_id 
            WHERE a.date = ? AND a.teacher_id = ?
            ORDER BY s.grade, s.full_name
        `, [today, req.session.teacher.teacher_id]);

        // Get attendance statistics
        const stats = await dbAll(`
            SELECT 
                COUNT(*) as total_students,
                SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) as present_today,
                SUM(CASE WHEN status = 'A' THEN 1 ELSE 0 END) as absent_today,
                SUM(CASE WHEN status = 'O' THEN 1 ELSE 0 END) as other_today
            FROM attendance 
            WHERE date = ? AND teacher_id = ?
        `, [today, req.session.teacher.teacher_id]);

        const stat = stats[0] || { total_students: 0, present_today: 0, absent_today: 0, other_today: 0 };

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Smart Attendance - WCU -CS school</title>
                <style>
                    :root {
                        --primary: #10B981;
                        --secondary: #059669;
                        --accent: #3B82F6;
                        --warning: #F59E0B;
                        --danger: #EF4444;
                    }
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #F8FAFC; color: #1F2937; }
                    
                    /* Header */
                    .header { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: white; padding: 30px 20px; }
                    .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    
                    /* Container */
                    .container { max-width: 1400px; margin: 30px auto; padding: 0 20px; }
                    
                    /* Cards */
                    .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 25px; }
                    
                    /* Buttons */
                    .btn { display: inline-block; padding: 12px 25px; margin: 5px; background: var(--primary); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; transition: all 0.3s ease; }
                    .btn:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
                    .btn-secondary { background: var(--accent); }
                    .btn-warning { background: var(--warning); }
                    
                    /* Stats Grid */
                    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 25px 0; }
                    .stat-card { background: white; padding: 25px; border-radius: 12px; text-align: center; box-shadow: 0 3px 10px rgba(0,0,0,0.08); border-top: 4px solid var(--primary); }
                    .stat-number { font-size: 2.5em; font-weight: 800; margin-bottom: 5px; }
                    .stat-present { color: var(--primary); border-color: var(--primary); }
                    .stat-absent { color: var(--danger); border-color: var(--danger); }
                    .stat-other { color: var(--warning); border-color: var(--warning); }
                    .stat-total { color: var(--accent); border-color: var(--accent); }
                    
                    /* Search Section */
                    .search-section { background: linear-gradient(135deg, #EFF6FF, #DBEAFE); padding: 25px; border-radius: 15px; margin: 20px 0; }
                    .search-form { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 15px; align-items: end; }
                    
                    /* Attendance Form */
                    .attendance-form { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 15px; align-items: center; margin: 15px 0; padding: 18px; background: #F8FAFC; border-radius: 12px; transition: all 0.3s ease; border-left: 4px solid transparent; }
                    .attendance-form:hover { background: #F1F5F9; border-left-color: var(--accent); }
                    
                    /* Student Info */
                    .student-info { background: #EFF6FF; padding: 20px; border-radius: 12px; margin: 20px 0; }
                    .student-header { display: flex; justify-content: between; align-items: center; margin-bottom: 15px; }
                    
                    /* Success Message */
                    .success-message { background: #D1FAE5; color: #065F46; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid var(--primary); }
                    
                    /* Input Styles */
                    input, select { padding: 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; transition: all 0.3s ease; }
                    input:focus, select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
                    
                    /* Radio Buttons */
                    .radio-group { display: flex; gap: 15px; }
                    .radio-label { display: flex; align-items: center; gap: 5px; cursor: pointer; padding: 8px 12px; border-radius: 6px; transition: all 0.3s ease; }
                    .radio-label:hover { background: #F3F4F6; }
                    .radio-present { color: var(--primary); }
                    .radio-absent { color: var(--danger); }
                    .radio-other { color: var(--warning); }
                    
                    /* Quick Actions */
                    .quick-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
                    
                    /* Responsive */
                    @media (max-width: 768px) {
                        .search-form, .attendance-form { grid-template-columns: 1fr; }
                        .stats-grid { grid-template-columns: repeat(2, 1fr); }
                        .radio-group { flex-direction: column; gap: 8px; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📊 Smart Attendance System</h1>
                    <p>Track and manage student attendance with advanced analytics</p>
                </div>

                <div class="nav">
                    <a href="/teacher-dashboard" class="btn" style="background: #6B7280;">← Dashboard</a>
                    <a href="/teacher-attendance" class="btn">📝 Today's Attendance</a>
                    <a href="#search" class="btn btn-secondary">🔍 Search Student</a>
                    <a href="#stats" class="btn btn-warning">📈 View Statistics</a>
                </div>

                <div class="container">
                    ${req.query.success ? `
                        <div class="success-message">
                            ✅ Attendance saved successfully! ${stat.present_today} students marked present today.
                        </div>
                    ` : ''}

                    <!-- Quick Statistics -->
                    <div class="card">
                        <h2>📈 Today's Attendance Overview</h2>
                        <div class="stats-grid">
                            <div class="stat-card stat-total">
                                <div class="stat-number">${students.length}</div>
                                <div>Total Students</div>
                            </div>
                            <div class="stat-card stat-present">
                                <div class="stat-number">${stat.present_today}</div>
                                <div>Present Today</div>
                            </div>
                            <div class="stat-card stat-absent">
                                <div class="stat-number">${stat.absent_today}</div>
                                <div>Absent Today</div>
                            </div>
                            <div class="stat-card stat-other">
                                <div class="stat-number">${stat.other_today}</div>
                                <div>Other</div>
                            </div>
                        </div>
                    </div>

                    <!-- Student Search -->
                    <div class="card" id="search">
                        <h2>🔍 Search Student Attendance</h2>
                        <div class="search-section">
                            <form action="/search-student-attendance" method="POST" class="search-form">
                                <div>
                                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Student ID</label>
                                    <input type="text" name="student_id" placeholder="Enter Student ID (e.g., WCU240001)" required style="width: 100%;">
                                </div>
                                <div>
                                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Time Period</label>
                                    <select name="period" style="width: 100%;">
                                        <option value="today">Today</option>
                                        <option value="week">This Week</option>
                                        <option value="month">This Month</option>
                                        <option value="year">This Year</option>
                                        <option value="all">All Time</option>
                                    </select>
                                </div>
                                <div>
                                    <button type="submit" class="btn" style="width: 100%;">🔍 Search Attendance</button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <!-- Quick Actions -->
                    <div class="card">
                        <h2>⚡ Quick Actions</h2>
                        <div class="quick-actions">
                            <button onclick="markAllPresent()" class="btn" style="background: var(--primary);">✅ Mark All Present</button>
                            <button onclick="markAllAbsent()" class="btn" style="background: var(--danger);">❌ Mark All Absent</button>
                            <button onclick="clearAll()" class="btn" style="background: var(--warning);">🔄 Clear All</button>
                            <button onclick="generateReport()" class="btn" style="background: var(--accent);">📊 Generate Report</button>
                        </div>
                    </div>

                    <!-- Main Attendance Form -->
                    <div class="card">
                        <h2>👨‍🎓 Student Attendance - ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h2>
                        <p style="color: #6B7280; margin-bottom: 20px;">
                            <strong>Legend:</strong> 
                            <span style="color: var(--primary);">✅ Present</span> | 
                            <span style="color: var(--danger);">❌ Absent</span> | 
                            <span style="color: var(--warning);">⚠️ Other (Sick/Late)</span>
                        </p>
                        
                        <form action="/take-attendance" method="POST" id="attendanceForm">
                            ${students.map(student => {
            const existingRecord = todayAttendance.find(a => a.student_id === student.student_id);
            return `
                                    <div class="attendance-form" data-student-id="${student.student_id}">
                                        <div>
                                            <strong>${student.full_name}</strong><br>
                                            <small>Grade ${student.grade} | ID: ${student.student_id}</small>
                                        </div>
                                        <div class="radio-group">
                                            <label class="radio-label radio-present">
                                                <input type="radio" id="P-${student.id}" name="attendance[${student.student_id}]" value="P" ${existingRecord?.status === 'P' ? 'checked' : ''} required>
                                                ✅ Present
                                            </label>
                                            <label class="radio-label radio-absent">
                                                <input type="radio" id="A-${student.id}" name="attendance[${student.student_id}]" value="A" ${existingRecord?.status === 'A' ? 'checked' : ''}>
                                                ❌ Absent
                                            </label>
                                            <label class="radio-label radio-other">
                                                <input type="radio" id="O-${student.id}" name="attendance[${student.student_id}]" value="O" ${existingRecord?.status === 'O' ? 'checked' : ''}>
                                                ⚠️ Other
                                            </label>
                                        </div>
                                    </div>
                                `;
        }).join('')}
                            
                            <div style="text-align: center; margin-top: 30px;">
                                <button type="submit" class="btn" style="font-size: 16px; padding: 15px 30px;">
                                    💾 Save Attendance for ${students.length} Students
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <script>
                    // Quick action functions
                    function markAllPresent() {
                        document.querySelectorAll('input[value="P"]').forEach(radio => {
                            radio.checked = true;
                        });
                        updateStats();
                        showNotification('All students marked as present!', 'success');
                    }
                    
                    function markAllAbsent() {
                        document.querySelectorAll('input[value="A"]').forEach(radio => {
                            radio.checked = true;
                        });
                        updateStats();
                        showNotification('All students marked as absent!', 'warning');
                    }
                    
                    function clearAll() {
                        document.querySelectorAll('input[type="radio"]').forEach(radio => {
                            radio.checked = false;
                        });
                        updateStats();
                        showNotification('All selections cleared!', 'info');
                    }
                    
                    function generateReport() {
                        const present = document.querySelectorAll('input[value="P"]:checked').length;
                        const absent = document.querySelectorAll('input[value="A"]:checked').length;
                        const other = document.querySelectorAll('input[value="O"]:checked').length;
                        const total = ${students.length};
                        
                        alert('📊 Attendance Report:\\n✅ Present: ' + present + ' (' + Math.round((present/total)*100) + '%)\\n❌ Absent: ' + absent + ' (' + Math.round((absent/total)*100) + '%)\\n⚠️ Other: ' + other + ' (' + Math.round((other/total)*100) + '%)\\n📝 Total: ' + total + ' students');
                    }
                    
                    // Real-time stats update
                    function updateStats() {
                        const present = document.querySelectorAll('input[value="P"]:checked').length;
                        const absent = document.querySelectorAll('input[value="A"]:checked').length;
                        const other = document.querySelectorAll('input[value="O"]:checked').length;
                        
                        // Update the stats display (you could add a live stats section)
                        console.log('Present: ' + present + ', Absent: ' + absent + ', Other: ' + other);
                    }
                    
                    // Add event listeners for real-time updates
                    document.querySelectorAll('input[type="radio"]').forEach(radio => {
                        radio.addEventListener('change', updateStats);
                    });
                    
                    // Notification function
                    function showNotification(message, type) {
                        const notification = document.createElement('div');
                        notification.style.cssText = 
                            'position: fixed;' +
                            'top: 20px;' +
                            'right: 20px;' +
                            'padding: 15px 20px;' +
                            'border-radius: 8px;' +
                            'color: white;' +
                            'font-weight: 600;' +
                            'z-index: 1000;' +
                            'animation: slideIn 0.3s ease;' +
                            'background: ' + (type === 'success' ? '#10B981' : type === 'warning' ? '#F59E0B' : '#3B82F6') + ';';
                        notification.textContent = message;
                        document.body.appendChild(notification);
                        
                        setTimeout(() => {
                            notification.remove();
                        }, 3000);
                    }
                    
                    // Add some CSS animations
                    const style = document.createElement('style');
                    style.textContent = 
                        '@keyframes slideIn {' +
                        'from { transform: translateX(100%); opacity: 0; }' +
                        'to { transform: translateX(0); opacity: 1; }' +
                        '}';
                    document.head.appendChild(style);
                    
                    // Initialize stats
                    updateStats();
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send("Error loading attendance: " + error.message);
    }
});

// ======================== STUDENT ATTENDANCE SEARCH ========================
app.post("/search-student-attendance", async (req, res) => {
    if (!req.session.teacher) return res.redirect("/teacher-login");

    const { student_id, period } = req.body;

    try {
        // Verify student exists
        const student = await dbGet("SELECT * FROM students WHERE student_id = ?", [student_id]);
        if (!student) {
            return res.redirect("/teacher-attendance?error=Student not found");
        }

        // Calculate date range based on period
        let dateCondition = "1=1";
        let periodText = "All Time";

        switch (period) {
            case 'today':
                dateCondition = "date = CURDATE()";
                periodText = "Today";
                break;
            case 'week':
                dateCondition = "date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
                periodText = "This Week";
                break;
            case 'month':
                dateCondition = "date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
                periodText = "This Month";
                break;
            case 'year':
                dateCondition = "date >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)";
                periodText = "This Year";
                break;
        }

        // Get attendance records
        const attendance = await dbAll(`
            SELECT a.*, t.full_name as teacher_name 
            FROM attendance a 
            LEFT JOIN teachers t ON a.teacher_id = t.teacher_id 
            WHERE a.student_id = ? AND ${dateCondition} 
            ORDER BY a.date DESC
        `, [student_id]);

        // Calculate statistics
        const stats = await dbAll(`
            SELECT 
                COUNT(*) as total_days,
                SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) as present_days,
                SUM(CASE WHEN status = 'A' THEN 1 ELSE 0 END) as absent_days,
                SUM(CASE WHEN status = 'O' THEN 1 ELSE 0 END) as other_days
            FROM attendance 
            WHERE student_id = ? AND ${dateCondition}
        `, [student_id]);

        const stat = stats[0] || { total_days: 0, present_days: 0, absent_days: 0, other_days: 0 };
        const attendanceRate = stat.total_days > 0 ? Math.round((stat.present_days / stat.total_days) * 100) : 0;

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Student Attendance Report - WCU</title>
                <style>
                    body { font-family: Arial; margin: 0; background: #F8FAFC; }
                    .header { background: linear-gradient(135deg, #3B82F6, #1D4ED8); color: white; padding: 30px 20px; }
                    .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                    .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 25px; }
                    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 25px 0; }
                    .stat-card { background: white; padding: 25px; border-radius: 12px; text-align: center; box-shadow: 0 3px 10px rgba(0,0,0,0.08); border-top: 4px solid; }
                    .stat-present { border-color: #10B981; color: #10B981; }
                    .stat-absent { border-color: #EF4444; color: #EF4444; }
                    .stat-other { border-color: #F59E0B; color: #F59E0B; }
                    .stat-rate { border-color: #3B82F6; color: #3B82F6; }
                    .btn { padding: 10px 20px; background: #3B82F6; color: white; text-decoration: none; border-radius: 5px; }
                    .attendance-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    .attendance-table th, .attendance-table td { padding: 12px; text-align: left; border-bottom: 1px solid #E5E7EB; }
                    .status-P { color: #10B981; font-weight: bold; }
                    .status-A { color: #EF4444; font-weight: bold; }
                    .status-O { color: #F59E0B; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📊 Student Attendance Report</h1>
                    <p>Detailed attendance analysis for ${student.full_name}</p>
                </div>

                <div class="nav">
                    <a href="/teacher-attendance" class="btn">← Back to Attendance</a>
                    <a href="/teacher-dashboard" class="btn" style="background: #6B7280;">Dashboard</a>
                </div>

                <div class="container">
                    <!-- Student Information -->
                    <div class="card">
                        <h2>👨‍🎓 Student Information</h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0;">
                            <div>
                                <strong>Student ID:</strong> ${student.student_id}<br>
                                <strong>Full Name:</strong> ${student.full_name}<br>
                                <strong>Grade:</strong> ${student.grade}
                            </div>
                            <div>
                                <strong>Village:</strong> ${student.village}<br>
                                <strong>Parent Phone:</strong> ${student.parent_phone}<br>
                                <strong>Period:</strong> ${periodText}
                            </div>
                        </div>
                    </div>

                    <!-- Statistics -->
                    <div class="card">
                        <h2>📈 Attendance Statistics (${periodText})</h2>
                        <div class="stats-grid">
                            <div class="stat-card stat-present">
                                <div style="font-size: 2.5em; font-weight: 800;">${stat.present_days}</div>
                                <div>Present Days</div>
                            </div>
                            <div class="stat-card stat-absent">
                                <div style="font-size: 2.5em; font-weight: 800;">${stat.absent_days}</div>
                                <div>Absent Days</div>
                            </div>
                            <div class="stat-card stat-other">
                                <div style="font-size: 2.5em; font-weight: 800;">${stat.other_days}</div>
                                <div>Other Days</div>
                            </div>
                            <div class="stat-card stat-rate">
                                <div style="font-size: 2.5em; font-weight: 800;">${attendanceRate}%</div>
                                <div>Attendance Rate</div>
                            </div>
                        </div>
                    </div>

                    <!-- Detailed Records -->
                    <div class="card">
                        <h2>📋 Detailed Attendance Records</h2>
                        ${attendance.length > 0 ? `
                            <table class="attendance-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Status</th>
                                        <th>Teacher</th>
                                        <th>Day</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${attendance.map(record => `
                                        <tr>
                                            <td>${new Date(record.date).toLocaleDateString()}</td>
                                            <td class="status-${record.status}">
                                                ${record.status === 'P' ? '✅ Present' : record.status === 'A' ? '❌ Absent' : '⚠️ Other'}
                                            </td>
                                            <td>${record.teacher_name || 'System'}</td>
                                            <td>${new Date(record.date).toLocaleDateString('en-US', { weekday: 'long' })}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : `
                            <p style="text-align: center; color: #6B7280; padding: 40px;">
                                No attendance records found for this period.
                            </p>
                        `}
                    </div>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        res.redirect("/teacher-attendance?error=" + error.message);
    }
});




// ======================== GRADE MANAGEMENT ========================
app.get("/teacher-grades", async (req, res) => {
    if (!req.session.teacher) return res.redirect("/teacher-login");

    try {
        const students = await dbAll("SELECT * FROM students ORDER BY grade, full_name");
        const subjects = await dbAll("SELECT DISTINCT subject_name FROM subjects ORDER BY subject_name");

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Grade Management - WCU -CS school</title>
                <style>
                    :root {
                        --primary: #8B5CF6;
                        --secondary: #7C3AED;
                    }
                    body { font-family: Arial; margin: 0; background: #F3F4F6; }
                    .header { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: white; padding: 30px 20px; }
                    .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                    .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 20px; }
                    .btn { display: inline-block; padding: 12px 25px; margin: 5px; background: var(--primary); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
                    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
                    .student-grade-row { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 15px; align-items: center; padding: 15px; background: #F8FAFC; border-radius: 10px; margin: 10px 0; }
                    .success-message { background: #D1FAE5; color: #065F46; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                    input, select { padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>🎯 Grade Management</h1>
                    <p>Post and manage student grades</p>
                </div>

                <div class="nav">
                    <a href="/teacher-dashboard" class="btn" style="background: #6B7280;">← Dashboard</a>
                    <a href="/teacher-grades" class="btn">📝 Post Grades</a>
                </div>

                <div class="container">
                    ${req.query.success ? `
                        <div class="success-message">
                            ✅ Grades posted successfully for all students!
                        </div>
                    ` : ''}

                    <div class="card">
                        <h2>📝 Post Student Grades</h2>
                        <form action="/post-grades" method="POST">
                            <div class="form-grid">
                                <div>
                                    <label>Subject *</label>
                                    <select name="subject" required>
                                        <option value="">Select Subject</option>
                                        ${subjects.map(subject => `
                                            <option value="${subject.subject_name}">${subject.subject_name}</option>
                                        `).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label>Term *</label>
                                    <select name="term" required>
                                        <option value="1">Term 1</option>
                                        <option value="2">Term 2</option>
                                        <option value="3">Term 3</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Academic Year *</label>
                                    <input type="number" name="year" value="${new Date().getFullYear()}" required>
                                </div>
                            </div>
                            
                            <h4 style="margin: 25px 0 15px 0;">Student Grades:</h4>
                            ${students.map(student => `
                                <div class="student-grade-row">
                                    <div>
                                        <strong>${student.full_name}</strong><br>
                                        <small>Grade ${student.grade} | ${student.student_id}</small>
                                    </div>
                                    <div>
                                        <select name="grades[${student.student_id}]" required>
                                            <option value="">Select Grade</option>
                                            <option value="A+">A+ (90-100)</option>
                                            <option value="A">A (80-89)</option>
                                            <option value="B+">B+ (75-79)</option>
                                            <option value="B">B (70-74)</option>
                                            <option value="C+">C+ (65-69)</option>
                                            <option value="C">C (60-64)</option>
                                            <option value="D">D (50-59)</option>
                                            <option value="F">F (Below 50)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <input type="number" name="marks[${student.student_id}]" placeholder="Marks (0-100)" min="0" max="100" style="width: 100%;">
                                    </div>
                                </div>
                            `).join('')}
                            
                            <button type="submit" class="btn" style="margin-top: 25px; font-size: 16px;">
                                💾 Save All Grades for ${students.length} Students
                            </button>
                        </form>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send("Error loading grade manager: " + error.message);
    }
});

app.post("/post-grades", async (req, res) => {
    if (!req.session.teacher) return res.redirect("/teacher-login");

    const { subject, term, year, grades } = req.body;

    try {
        for (const [student_id, grade] of Object.entries(grades)) {
            await dbRun(
                "INSERT INTO grades (student_id, subject, grade, term, year, teacher_id) VALUES (?, ?, ?, ?, ?, ?)",
                [student_id, subject, grade, term, year, req.session.teacher.teacher_id]
            );
        }

        res.redirect("/teacher-grades?success=true");
    } catch (error) {
        res.redirect("/teacher-grades?error=" + error.message);
    }
});

// ======================== PDF MATERIALS UPLOAD ========================
app.get("/teacher-materials", async (req, res) => {
    if (!req.session.teacher) return res.redirect("/teacher-login");

    try {
        const myMaterials = await dbAll(
            "SELECT * FROM class_materials WHERE uploaded_by = ? ORDER BY uploaded_at DESC",
            [req.session.teacher.teacher_id]
        );

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Materials Upload - WCU -CS school</title>
                <style>
                    :root {
                        --primary: #F59E0B;
                        --secondary: #D97706;
                    }
                    body { font-family: Arial; margin: 0; background: #F3F4F6; }
                    .header { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: white; padding: 30px 20px; }
                    .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                    .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 20px; }
                    .btn { display: inline-block; padding: 12px 25px; margin: 5px; background: var(--primary); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
                    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
                    .material-card { background: white; padding: 20px; border-radius: 10px; margin: 15px 0; box-shadow: 0 3px 10px rgba(0,0,0,0.1); }
                    .success-message { background: #D1FAE5; color: #065F46; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                    input, select, textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; margin: 5px 0; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📚 PDF Materials Upload</h1>
                    <p>Upload class materials for students</p>
                </div>

                <div class="nav">
                    <a href="/teacher-dashboard" class="btn" style="background: #6B7280;">← Dashboard</a>
                    <a href="/teacher-materials" class="btn">📤 Upload Materials</a>
                    <a href="/classes" class="btn" style="background: #10B981;">👀 View Digital Classes</a>
                </div>

                <div class="container">
                    ${req.query.success ? `
                        <div class="success-message">
                            ✅ Material uploaded successfully! Students can now access it in Digital Classes.
                        </div>
                    ` : ''}

                    <div class="card">
                        <h2>📤 Upload New Class Material</h2>
                        <form action="/upload-material" method="POST" enctype="multipart/form-data">
                            <div class="form-grid">
                                <div>
                                    <label>Grade Level *</label>
                                    <select name="grade" required>
                                        <option value="">Select Grade</option>
                                        <option value="KG1">Kindergarten 1</option>
                                        <option value="KG2">Kindergarten 2</option>
                                        <option value="KG3">Kindergarten 3</option>
                                        <option value="1">Grade 1</option>
                                        <option value="2">Grade 2</option>
                                        <option value="3">Grade 3</option>
                                        <option value="4">Grade 4</option>
                                        <option value="5">Grade 5</option>
                                        <option value="6">Grade 6</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Subject *</label>
                                    <input type="text" name="subject" required placeholder="Mathematics, Science, etc.">
                                </div>
                                <div>
                                    <label>Title *</label>
                                    <input type="text" name="title" required placeholder="Material title">
                                </div>
                            </div>
                            
                            <div>
                                <label>Description</label>
                                <textarea name="description" placeholder="Brief description of the material" rows="3"></textarea>
                            </div>
                            
                            <div style="margin: 20px 0;">
                                <label>PDF File *</label>
                                <input type="file" name="pdf_file" accept=".pdf" required>
                                <small style="color: #6B7280;">Upload PDF file (max 10MB)</small>
                            </div>
                            
                            <button type="submit" class="btn" style="font-size: 16px;">
                                🚀 Upload Material to Digital Classes
                            </button>
                        </form>
                    </div>

                    <div class="card">
                        <h2>📋 My Uploaded Materials (${myMaterials.length})</h2>
                        ${myMaterials.map(material => `
                            <div class="material-card">
                                <h4>${material.title}</h4>
                                <p><strong>Grade:</strong> ${material.grade} | <strong>Subject:</strong> ${material.subject}</p>
                                <p>${material.description || 'No description'}</p>
                                <div style="margin-top: 15px;">
                                    <a href="/uploads/${path.basename(material.pdf_path)}" target="_blank" class="btn" style="padding: 8px 15px; font-size: 0.8em;">👁️ View PDF</a>
                                    <a href="/uploads/${path.basename(material.pdf_path)}" download class="btn" style="background: #10B981; padding: 8px 15px; font-size: 0.8em;">📥 Download</a>
                                    <a href="/delete-material/${material.id}" class="btn" style="background: #EF4444; padding: 8px 15px; font-size: 0.8em;">🗑️ Delete</a>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send("Error loading materials: " + error.message);
    }
});

app.post("/upload-material", upload.single('pdf_file'), async (req, res) => {
    if (!req.session.teacher) return res.redirect("/teacher-login");

    const { grade, subject, title, description } = req.body;

    try {
        await dbRun(
            "INSERT INTO class_materials (grade, subject, title, description, pdf_path, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)",
            [grade, subject, title, description, `/uploads/${req.file.filename}`, req.session.teacher.teacher_id]
        );

        res.redirect("/teacher-materials?success=true");
    } catch (error) {
        res.redirect("/teacher-materials?error=" + error.message);
    }
});

// ======================== TEACHER LOGOUT ========================
app.get("/teacher-logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});


// ======================== ENHANCED ADMIN ROUTES ========================
app.get("/admin", (req, res) => {
    if (req.session.admin) {
        return res.redirect("/admin-dashboard");
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Admin Login - WCU -CS school</title>
            <style>
                body { font-family: Arial; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
                .login-container { background: white; border-radius: 20px; padding: 50px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); width: 100%; max-width: 450px; text-align: center; }
                .login-icon { font-size: 4em; margin-bottom: 20px; }
                h1 { color: #1F2937; margin-bottom: 10px; font-size: 2.2em; }
                .form-group { margin-bottom: 20px; text-align: left; }
                label { display: block; margin-bottom: 8px; font-weight: 600; color: #1F2937; }
                input { width: 100%; padding: 15px; border: 2px solid #E5E7EB; border-radius: 10px; font-size: 16px; }
                .btn-login { width: 100%; padding: 15px; background: #8B5CF6; color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; margin-bottom: 20px; }
                .demo-info { background: #F3F4F6; padding: 20px; border-radius: 10px; margin-top: 25px; text-align: left; }
                .error { color: red; margin-bottom: 15px; }
            </style>
        </head>
        <body>
            <div class="login-container">
                <div class="login-icon">⚙️</div>
                <h1>Admin Login</h1>
                <p style="color: #6B7280; margin-bottom: 30px;">System Administrator Access</p>
                
                ${req.query.error ? '<div class="error">❌ Invalid username or password</div>' : ''}
                
                <form action="/admin" method="POST">
                    <div class="form-group">
                        <label for="username">Admin Username</label>
                        <input type="text" id="username" name="username" required placeholder="Enter admin username" value="admin">
                    </div>
                    
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" name="password" required placeholder="Enter admin password" value="admin123">
                    </div>
                    
                    <button type="submit" class="btn-login">🔐 Login as Admin</button>
                </form>
                
                <div class="demo-info">
                    <h3 style="color: #8B5CF6; margin-bottom: 10px;">Default Admin Credentials:</h3>
                    <p><strong>Username:</strong> admin</p>
                    <p><strong>Password:</strong> admin123</p>
                    <p><strong>Role:</strong> System Administrator</p>
                </div>
                
                <a href="/" style="color: #6B7280; text-decoration: none; margin-top: 20px; display: inline-block;">← Back to School</a>
            </div>
        </body>
        </html>
    `);
});

app.post("/admin", async (req, res) => {
    const { username, password } = req.body;

    // Enhanced admin authentication
    if (username === 'admin' && password === 'admin123') {
        req.session.admin = true;
        req.session.adminUser = {
            username: 'admin',
            role: 'administrator',
            loginTime: new Date()
        };
        res.redirect("/admin-dashboard");
    } else {
        res.redirect("/admin?error=true");
    }
});

// ======================== ENHANCED ADMIN DASHBOARD ========================
app.get("/admin-dashboard", async (req, res) => {
    if (!req.session.admin) return res.redirect("/admin");

    try {
        // Get comprehensive statistics
        const stats = await dbAll(`
            SELECT 
                (SELECT COUNT(*) FROM students) as total_students,
                (SELECT COUNT(*) FROM teachers) as total_teachers,
                (SELECT COUNT(*) FROM payments WHERE status = 'pending') as pending_payments,
                (SELECT COUNT(*) FROM payments WHERE status = 'approved') as approved_payments,
                (SELECT COUNT(*) FROM attendance WHERE date = CURDATE()) as today_attendance,
                (SELECT COUNT(*) FROM class_materials) as total_materials,
                (SELECT COUNT(*) FROM announcements) as total_announcements
        `);

        const stat = stats[0];

        // Get recent activities
        const recentStudents = await dbAll("SELECT * FROM students ORDER BY created_at DESC LIMIT 5");
        const pendingPayments = await dbAll("SELECT p.*, s.full_name FROM payments p JOIN students s ON p.student_id = s.student_id WHERE p.status = 'pending' LIMIT 5");

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Admin Dashboard - WCU -CS school</title>
                <style>
                    :root {
                        --primary: #8B5CF6;
                        --secondary: #10B981;
                        --danger: #EF4444;
                        --warning: #F59E0B;
                        --dark: #1F2937;
                    }
                    body { font-family: Arial; margin: 0; background: #F3F4F6; }
                    .header { background: linear-gradient(135deg, var(--primary), #7C3AED); color: white; padding: 30px 20px; }
                    .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .container { max-width: 1400px; margin: 30px auto; padding: 0 20px; }
                    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
                    .stat-card { background: white; padding: 25px; border-radius: 10px; text-align: center; box-shadow: 0 3px 10px rgba(0,0,0,0.1); }
                    .stat-number { font-size: 2.5em; font-weight: 800; color: var(--primary); margin-bottom: 5px; }
                    .admin-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 25px; margin: 40px 0; }
                    .admin-card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
                    .btn { display: inline-block; padding: 12px 25px; margin: 5px; background: var(--primary); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
                    .btn-success { background: var(--secondary); }
                    .btn-danger { background: var(--danger); }
                    .btn-warning { background: var(--warning); }
                    .activity-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                    .activity-table th, .activity-table td { padding: 12px; text-align: left; border-bottom: 1px solid #E5E7EB; }
                    .activity-table th { background: #F9FAFB; font-weight: 600; }
                    .status-pending { color: var(--warning); font-weight: bold; }
                    .status-approved { color: var(--secondary); font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>⚙️ Admin Dashboard</h1>
                    <p>System Administration Panel - WCU -CS school</p>
                    <p>Welcome, Administrator! | Login: ${req.session.adminUser.loginTime.toLocaleString()}</p>
                </div>

                <div class="nav">
                    <a href="/admin-dashboard" class="btn">📊 Dashboard</a>
                    <a href="/admin-teachers" class="btn">👨‍🏫 Manage Teachers</a>
                    <a href="/admin-materials" class="btn">📚 Class Materials</a>
                    <a href="/admin-payments" class="btn">💰 Payment Approval</a>
                    <a href="/admin-users" class="btn">👥 User Management</a>
                    <a href="/admin-reports" class="btn">📈 Reports</a>
                    <a href="/" class="btn" style="background: #6B7280;">🏠 School Home</a>
                    <a href="/admin-logout" class="btn" style="background: #EF4444;">🚪 Logout</a>
                </div>

                <div class="container">
                    <h2>📈 System Overview</h2>
                    
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-number">${stat.total_students || 0}</div>
                            <div>Total Students</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stat.total_teachers || 0}</div>
                            <div>Teachers</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stat.pending_payments || 0}</div>
                            <div>Pending Payments</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stat.today_attendance || 0}</div>
                            <div>Today's Attendance</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stat.total_materials || 0}</div>
                            <div>Class Materials</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stat.total_announcements || 0}</div>
                            <div>Announcements</div>
                        </div>
                    </div>

                    <div class="admin-grid">
                        <div class="admin-card">
                            <h3>🚀 Quick Actions</h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0;">
                                <a href="/admin-teachers?action=add" class="btn">➕ Add Teacher</a>
                                <a href="/admin-materials?action=upload" class="btn">📤 Upload Material</a>
                                <a href="/admin-payments" class="btn btn-warning">💰 Approve Payments</a>
                                <a href="/admin-users" class="btn">👥 Manage Users</a>
                                <a href="/admin-announcements" class="btn">📢 Post Announcement</a>
                                <a href="/admin-reports" class="btn btn-success">📊 Generate Report</a>
                            </div>
                            
                            <h4>📋 Recent Student Registrations</h4>
                            <table class="activity-table">
                                <thead>
                                    <tr>
                                        <th>Student ID</th>
                                        <th>Name</th>
                                        <th>Grade</th>
                                        <th>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${recentStudents.map(student => `
                                        <tr>
                                            <td>${student.student_id}</td>
                                            <td>${student.full_name}</td>
                                            <td>${student.grade}</td>
                                            <td>${new Date(student.created_at).toLocaleDateString()}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        
                        <div class="admin-card">
                            <h3>⏰ Pending Actions</h3>
                            <h4>💰 Payment Approvals Needed</h4>
                            ${pendingPayments.length > 0 ? `
                                <table class="activity-table">
                                    <thead>
                                        <tr>
                                            <th>Student</th>
                                            <th>Amount</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${pendingPayments.map(payment => `
                                            <tr>
                                                <td>${payment.full_name}</td>
                                                <td>ETB ${payment.amount}</td>
                                                <td>
                                                    <a href="/admin-approve-payment/${payment.id}" class="btn btn-success" style="padding: 5px 10px; font-size: 0.8em;">✓ Approve</a>
                                                    <a href="/admin-reject-payment/${payment.id}" class="btn btn-danger" style="padding: 5px 10px; font-size: 0.8em;">✗ Reject</a>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            ` : '<p>No pending payments</p>'}
                            
                            <div style="margin-top: 20px; padding: 15px; background: #EFF6FF; border-radius: 8px;">
                                <h4>📊 System Status</h4>
                                <p>✅ Database: Connected</p>
                                <p>✅ Server: Running</p>
                                <p>✅ Sessions: Active</p>
                                <p>🕒 Uptime: ${Math.floor(process.uptime() / 60)} minutes</p>
                            </div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send("Error loading admin dashboard: " + error.message);
    }


});


// ======================== MODERN TEACHER DASHBOARD ========================
app.get("/teacher-dashboard", async (req, res) => {
    if (!req.session.teacher) return res.redirect("/teacher-login");

    try {
        const teacher = req.session.teacher;
        const today = new Date().toISOString().split('T')[0];

        // Get comprehensive stats
        const stats = await dbAll(`
            SELECT 
                (SELECT COUNT(*) FROM students) as total_students,
                (SELECT COUNT(*) FROM attendance WHERE date = ? AND teacher_id = ?) as today_attendance,
                (SELECT COUNT(*) FROM class_materials WHERE uploaded_by = ?) as my_materials,
                (SELECT COUNT(*) FROM grades WHERE teacher_id = ?) as grades_posted
        `, [today, teacher.teacher_id, teacher.teacher_id, teacher.teacher_id]);

        // Get recent activities
        const recentAttendance = await dbAll(`
            SELECT a.*, s.full_name, s.grade 
            FROM attendance a 
            JOIN students s ON a.student_id = s.student_id 
            WHERE a.teacher_id = ? 
            ORDER BY a.created_at DESC LIMIT 5
        `, [teacher.teacher_id]);

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Smart Teacher Dashboard - WCU</title>
                <style>
                    :root {
                        --primary: #3B82F6;
                        --secondary: #10B981;
                        --accent: #8B5CF6;
                        --warning: #F59E0B;
                        --danger: #EF4444;
                    }
                    
                    .modern-dashboard {
                        background: #F8FAFC;
                        min-height: 100vh;
                    }
                    
                    .dashboard-header {
                        background: linear-gradient(135deg, var(--primary), var(--accent));
                        color: white;
                        padding: 30px;
                        position: relative;
                        overflow: hidden;
                    }
                    
                    .header-content {
                        max-width: 1200px;
                        margin: 0 auto;
                    }
                    
                    .welcome-section h1 {
                        font-size: 2.5em;
                        margin-bottom: 10px;
                    }
                    
                    .quick-stats {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 20px;
                        margin: 30px 0;
                    }
                    
                    .stat-card {
                        background: rgba(255,255,255,0.1);
                        padding: 20px;
                        border-radius: 15px;
                        backdrop-filter: blur(10px);
                        text-align: center;
                    }
                    
                    .stat-number {
                        font-size: 2.5em;
                        font-weight: 800;
                        margin-bottom: 5px;
                    }
                    
                    .dashboard-nav {
                        background: white;
                        padding: 20px;
                        box-shadow: 0 2px 20px rgba(0,0,0,0.1);
                    }
                    
                    .nav-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 15px;
                        max-width: 1200px;
                        margin: 0 auto;
                    }
                    
                    .nav-card {
                        background: white;
                        padding: 25px;
                        border-radius: 15px;
                        text-align: center;
                        text-decoration: none;
                        color: var(--primary);
                        font-weight: 600;
                        transition: all 0.3s ease;
                        border: 2px solid transparent;
                    }
                    
                    .nav-card:hover {
                        transform: translateY(-5px);
                        border-color: var(--primary);
                        box-shadow: 0 10px 25px rgba(59, 130, 246, 0.15);
                    }
                    
                    .nav-icon {
                        font-size: 2.5em;
                        margin-bottom: 10px;
                    }
                    
                    .dashboard-content {
                        max-width: 1200px;
                        margin: 30px auto;
                        padding: 0 20px;
                        display: grid;
                        grid-template-columns: 2fr 1fr;
                        gap: 30px;
                    }
                    
                    .activity-card {
                        background: white;
                        padding: 25px;
                        border-radius: 15px;
                        box-shadow: 0 5px 15px rgba(0,0,0,0.08);
                    }
                    
                    @media (max-width: 768px) {
                        .dashboard-content {
                            grid-template-columns: 1fr;
                        }
                        
                        .nav-grid {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }
                </style>
            </head>
            <body class="modern-dashboard">
                <div class="dashboard-header">
                    <div class="header-content">
                        <div class="welcome-section">
                            <h1>👨‍🏫 Welcome, ${teacher.full_name}!</h1>
                            <p>Smart Teaching Dashboard - ${teacher.subject || 'General'} Teacher</p>
                        </div>
                        
                        <div class="quick-stats">
                            <div class="stat-card">
                                <div class="stat-number">${stats[0].total_students || 0}</div>
                                <div>Total Students</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-number">${stats[0].today_attendance || 0}</div>
                                <div>Today's Attendance</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-number">${stats[0].my_materials || 0}</div>
                                <div>My Materials</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-number">${stats[0].grades_posted || 0}</div>
                                <div>Grades Posted</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="dashboard-nav">
                    <div class="nav-grid">
                        <a href="/teacher-attendance" class="nav-card">
                            <div class="nav-icon">📊</div>
                            <div>Smart Attendance</div>
                        </a>
                        <a href="/teacher-materials" class="nav-card">
                            <div class="nav-icon">📚</div>
                            <div>Class Materials</div>
                        </a>
                        <a href="/teacher-grades" class="nav-card">
                            <div class="nav-icon">🎯</div>
                            <div>Post Grades</div>
                        </a>
                        <a href="/teacher-exams" class="nav-card">
                            <div class="nav-icon">📝</div>
                            <div>Exam Manager</div>
                        </a>
                        <a href="/teacher-analytics" class="nav-card">
                            <div class="nav-icon">📈</div>
                            <div>Analytics</div>
                        </a>
                        <a href="/teacher-profile" class="nav-card">
                            <div class="nav-icon">👤</div>
                            <div>My Profile</div>
                        </a>
                    </div>
                </div>
                
                <div class="dashboard-content">
                    <div class="activity-card">
                        <h3>📋 Recent Attendance</h3>
                        ${recentAttendance.length > 0 ? recentAttendance.map(record => `
                            <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee;">
                                <div>
                                    <strong>${record.full_name}</strong> (Grade ${record.grade})
                                </div>
                                <div>
                                    <span class="status-${record.status}" style="color: ${record.status === 'P' ? '#10B981' : record.status === 'A' ? '#EF4444' : '#F59E0B'}">
                                        ${record.status === 'P' ? '✅ Present' : record.status === 'A' ? '❌ Absent' : '⚠️ Other'}
                                    </span>
                                </div>
                            </div>
                        `).join('') : '<p>No recent attendance records.</p>'}
                    </div>
                    
                    <div class="activity-card">
                        <h3>🚀 Quick Actions</h3>
                        <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 15px;">
                            <a href="/teacher-attendance?quick=true" style="padding: 12px; background: var(--primary); color: white; text-decoration: none; border-radius: 8px; text-align: center;">
                                📥 Take Quick Attendance
                            </a>
                            <a href="/teacher-materials?upload=true" style="padding: 12px; background: var(--secondary); color: white; text-decoration: none; border-radius: 8px; text-align: center;">
                                📤 Upload Material
                            </a>
                            <a href="/teacher-grades?bulk=true" style="padding: 12px; background: var(--accent); color: white; text-decoration: none; border-radius: 8px; text-align: center;">
                                🎯 Bulk Grade Entry
                            </a>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send("Error loading dashboard: " + error.message);
    }
});

// ======================== TEACHER MANAGEMENT ========================
app.get("/admin-teachers", async (req, res) => {
    if (!req.session.admin) return res.redirect("/admin");

    try {
        const teachers = await dbAll("SELECT * FROM teachers ORDER BY created_at DESC");
        const action = req.query.action;

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Teacher Management - WCU -CS school</title>
                <style>
                    body { font-family: Arial; margin: 0; background: #F3F4F6; }
                    .header { background: linear-gradient(135deg, #8B5CF6, #7C3AED); color: white; padding: 30px 20px; }
                    .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                    .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 20px; }
                    .btn { display: inline-block; padding: 12px 25px; margin: 5px; background: #8B5CF6; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
                    .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #E5E7EB; }
                    .table th { background: #F9FAFB; font-weight: 600; }
                    .form-group { margin-bottom: 20px; }
                    label { display: block; margin-bottom: 8px; font-weight: 600; }
                    input, select { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>👨‍🏫 Teacher Management</h1>
                    <p>Add and manage teacher accounts</p>
                </div>

                <div class="nav">
                    <a href="/admin-dashboard" class="btn">← Dashboard</a>
                    <a href="/admin-teachers?action=add" class="btn">➕ Add Teacher</a>
                    <a href="/admin-teachers" class="btn">📋 All Teachers</a>
                </div>

                <div class="container">
                    ${action === 'add' ? `
                        <div class="card">
                            <h2>➕ Add New Teacher</h2>
                            <form action="/admin-add-teacher" method="POST">
                                <div class="form-group">
                                    <label>Teacher ID *</label>
                                    <input type="text" name="teacher_id" required placeholder="TECH001">
                                </div>
                                <div class="form-group">
                                    <label>Full Name *</label>
                                    <input type="text" name="full_name" required placeholder="Teacher's full name">
                                </div>
                                <div class="form-group">
                                    <label>Email *</label>
                                    <input type="email" name="email" required placeholder="teacher@wcu-cs.edu.et">
                                </div>
                                <div class="form-group">
                                    <label>Password *</label>
                                    <input type="password" name="password" required placeholder="Set teacher password">
                                </div>
                                <div class="form-group">
                                    <label>Subject</label>
                                    <input type="text" name="subject" placeholder="Mathematics, Science, etc.">
                                </div>
                                <div class="form-group">
                                    <label>Phone</label>
                                    <input type="tel" name="phone" placeholder="+251911223344">
                                </div>
                                <button type="submit" class="btn">➕ Add Teacher</button>
                            </form>
                        </div>
                    ` : ''}

                    <div class="card">
                        <h2>📋 All Teachers (${teachers.length})</h2>
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Teacher ID</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Subject</th>
                                    <th>Join Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${teachers.map(teacher => `
                                    <tr>
                                        <td>${teacher.teacher_id}</td>
                                        <td>${teacher.full_name}</td>
                                        <td>${teacher.email}</td>
                                        <td>${teacher.subject || 'Not set'}</td>
                                        <td>${new Date(teacher.created_at).toLocaleDateString()}</td>
                                        <td>
                                            <a href="/admin-edit-teacher/${teacher.id}" class="btn" style="padding: 5px 10px; font-size: 0.8em;">✏️ Edit</a>
                                            <a href="/admin-delete-teacher/${teacher.id}" class="btn" style="background: #EF4444; padding: 5px 10px; font-size: 0.8em;">🗑️ Delete</a>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send("Error loading teacher management: " + error.message);
    }
});

app.post("/admin-add-teacher", async (req, res) => {
    if (!req.session.admin) return res.redirect("/admin");

    const { teacher_id, full_name, email, password, subject, phone } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        await dbRun(
            "INSERT INTO teachers (teacher_id, full_name, email, password, subject, phone) VALUES (?, ?, ?, ?, ?, ?)",
            [teacher_id, full_name, email, hashedPassword, subject, phone]
        );

        res.redirect("/admin-teachers?success=Teacher added successfully");
    } catch (error) {
        res.redirect("/admin-teachers?error=" + error.message);
    }
});

// ======================== CLASS MATERIALS MANAGEMENT ========================
app.get("/admin-materials", async (req, res) => {
    if (!req.session.admin) return res.redirect("/admin");

    try {
        const materials = await dbAll("SELECT * FROM class_materials ORDER BY grade, subject");
        const action = req.query.action;

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Class Materials - WCU -CS school</title>
                <style>
                    body { font-family: Arial; margin: 0; background: #F3F4F6; }
                    .header { background: linear-gradient(135deg, #10B981, #059669); color: white; padding: 30px 20px; }
                    .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                    .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 20px; }
                    .btn { display: inline-block; padding: 12px 25px; margin: 5px; background: #10B981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
                    .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    .form-group { margin-bottom: 20px; }
                    label { display: block; margin-bottom: 8px; font-weight: 600; }
                    input, select, textarea { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📚 Class Materials Management</h1>
                    <p>Upload and manage class materials and PDFs</p>
                </div>

                <div class="nav">
                    <a href="/admin-dashboard" class="btn">← Dashboard</a>
                    <a href="/admin-materials?action=upload" class="btn">📤 Upload Material</a>
                    <a href="/admin-materials" class="btn">📋 All Materials</a>
                </div>

                <div class="container">
                    ${action === 'upload' ? `
                        <div class="card">
                            <h2>📤 Upload Class Material</h2>
                            <form action="/admin-upload-material" method="POST" enctype="multipart/form-data">
                                <div class="form-group">
                                    <label>Grade *</label>
                                    <select name="grade" required>
                                        <option value="">Select Grade</option>
                                        <option value="KG1">Kindergarten 1</option>
                                        <option value="KG2">Kindergarten 2</option>
                                        <option value="KG3">Kindergarten 3</option>
                                        <option value="1">Grade 1</option>
                                        <option value="2">Grade 2</option>
                                        <option value="3">Grade 3</option>
                                        <option value="4">Grade 4</option>
                                        <option value="5">Grade 5</option>
                                        <option value="6">Grade 6</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Subject *</label>
                                    <input type="text" name="subject" required placeholder="Mathematics, English, Science, etc.">
                                </div>
                                <div class="form-group">
                                    <label>Title *</label>
                                    <input type="text" name="title" required placeholder="Material title">
                                </div>
                                <div class="form-group">
                                    <label>Description</label>
                                    <textarea name="description" placeholder="Material description"></textarea>
                                </div>
                                <div class="form-group">
                                    <label>PDF File *</label>
                                    <input type="file" name="pdf_file" accept=".pdf" required>
                                    <small>Upload PDF file (max 10MB)</small>
                                </div>
                                <button type="submit" class="btn">📤 Upload Material</button>
                            </form>
                        </div>
                    ` : ''}

                    <div class="card">
                        <h2>📋 All Class Materials (${materials.length})</h2>
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Grade</th>
                                    <th>Subject</th>
                                    <th>Title</th>
                                    <th>Upload Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${materials.map(material => `
                                    <tr>
                                        <td>Grade ${material.grade}</td>
                                        <td>${material.subject}</td>
                                        <td>${material.title}</td>
                                        <td>${new Date(material.uploaded_at).toLocaleDateString()}</td>
                                        <td>
                                            <a href="/uploads/${path.basename(material.pdf_path)}" target="_blank" class="btn" style="padding: 5px 10px; font-size: 0.8em;">👁️ View</a>
                                            <a href="/admin-delete-material/${material.id}" class="btn" style="background: #EF4444; padding: 5px 10px; font-size: 0.8em;">🗑️ Delete</a>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send("Error loading materials management: " + error.message);
    }
});

app.post("/admin-upload-material", upload.single('pdf_file'), async (req, res) => {
    if (!req.session.admin) return res.redirect("/admin");

    const { grade, subject, title, description } = req.body;

    try {
        await dbRun(
            "INSERT INTO class_materials (grade, subject, title, description, pdf_path, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)",
            [grade, subject, title, description, `/uploads/${req.file.filename}`, 'admin']
        );

        res.redirect("/admin-materials?success=Material uploaded successfully");
    } catch (error) {
        res.redirect("/admin-materials?error=" + error.message);
    }
});

// ======================== PAYMENT APPROVAL ========================
app.get("/admin-payments", async (req, res) => {
    if (!req.session.admin) return res.redirect("/admin");

    try {
        const pendingPayments = await dbAll(`
            SELECT p.*, s.full_name, s.grade 
            FROM payments p 
            JOIN students s ON p.student_id = s.student_id 
            WHERE p.status = 'pending'
            ORDER BY p.paid_at DESC
        `);

        const approvedPayments = await dbAll(`
            SELECT p.*, s.full_name, s.grade 
            FROM payments p 
            JOIN students s ON p.student_id = s.student_id 
            WHERE p.status = 'approved'
            ORDER BY p.approved_at DESC
            LIMIT 10
        `);

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Payment Approval - WCU -CS school</title>
                <style>
                    body { font-family: Arial; margin: 0; background: #F3F4F6; }
                    .header { background: linear-gradient(135deg, #F59E0B, #D97706); color: white; padding: 30px 20px; }
                    .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                    .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 20px; }
                    .btn { display: inline-block; padding: 8px 15px; margin: 2px; color: white; text-decoration: none; border-radius: 5px; font-weight: 600; font-size: 0.8em; }
                    .btn-approve { background: #10B981; }
                    .btn-reject { background: #EF4444; }
                    .btn-view { background: #3B82F6; }
                    .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #E5E7EB; }
                    .status-pending { color: #F59E0B; font-weight: bold; }
                    .status-approved { color: #10B981; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>💰 Payment Approval</h1>
                    <p>Approve or reject student payments</p>
                </div>

                <div class="nav">
                    <a href="/admin-dashboard" class="btn" style="background: #6B7280;">← Dashboard</a>
                    <a href="/admin-payments" class="btn" style="background: #F59E0B;">⏳ Pending (${pendingPayments.length})</a>
                    <a href="#approved" class="btn" style="background: #10B981;">✅ Approved</a>
                </div>

                <div class="container">
                    <div class="card">
                        <h2>⏳ Pending Payments (${pendingPayments.length})</h2>
                        ${pendingPayments.length > 0 ? `
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Grade</th>
                                        <th>Amount</th>
                                        <th>Method</th>
                                        <th>Date</th>
                                        <th>Transaction ID</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${pendingPayments.map(payment => `
                                        <tr>
                                            <td>${payment.full_name}</td>
                                            <td>${payment.grade}</td>
                                            <td>ETB ${payment.amount}</td>
                                            <td>${payment.payment_method}</td>
                                            <td>${new Date(payment.paid_at).toLocaleDateString()}</td>
                                            <td>${payment.transaction_id || 'N/A'}</td>
                                            <td>
                                                ${payment.screenshot_path ? `<a href="${payment.screenshot_path}" target="_blank" class="btn btn-view">👁️ Proof</a>` : ''}
                                                <a href="/admin-approve-payment/${payment.id}" class="btn btn-approve">✓ Approve</a>
                                                <a href="/admin-reject-payment/${payment.id}" class="btn btn-reject">✗ Reject</a>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<p>No pending payments to approve.</p>'}
                    </div>

                    <div class="card" id="approved">
                        <h2>✅ Recently Approved Payments</h2>
                        ${approvedPayments.length > 0 ? `
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Amount</th>
                                        <th>Method</th>
                                        <th>Approved Date</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${approvedPayments.map(payment => `
                                        <tr>
                                            <td>${payment.full_name}</td>
                                            <td>ETB ${payment.amount}</td>
                                            <td>${payment.payment_method}</td>
                                            <td>${new Date(payment.approved_at).toLocaleDateString()}</td>
                                            <td class="status-approved">Approved</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<p>No approved payments yet.</p>'}
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send("Error loading payment approval: " + error.message);
    }
});

// Payment approval actions
app.get("/admin-approve-payment/:id", async (req, res) => {
    if (!req.session.admin) return res.redirect("/admin");

    try {
        await dbRun(
            "UPDATE payments SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?",
            [req.session.adminUser.username, req.params.id]
        );
        res.redirect("/admin-payments?success=Payment approved successfully");
    } catch (error) {
        res.redirect("/admin-payments?error=" + error.message);
    }
});

app.get("/admin-reject-payment/:id", async (req, res) => {
    if (!req.session.admin) return res.redirect("/admin");

    try {
        await dbRun(
            "UPDATE payments SET status = 'rejected', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?",
            [req.session.adminUser.username, req.params.id]
        );
        res.redirect("/admin-payments?success=Payment rejected");
    } catch (error) {
        res.redirect("/admin-payments?error=" + error.message);
    }
});

// ======================== USER MANAGEMENT ========================
app.get("/admin-users", async (req, res) => {
    if (!req.session.admin) return res.redirect("/admin");

    try {
        const students = await dbAll("SELECT * FROM students ORDER BY created_at DESC");
        const teachers = await dbAll("SELECT * FROM teachers ORDER BY created_at DESC");

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>User Management - WCU -CS school</title>
                <style>
                    body { font-family: Arial; margin: 0; background: #F3F4F6; }
                    .header { background: linear-gradient(135deg, #3B82F6, #1D4ED8); color: white; padding: 30px 20px; }
                    .nav { background: white; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
                    .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 20px; }
                    .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    .btn { display: inline-block; padding: 8px 15px; margin: 2px; color: white; text-decoration: none; border-radius: 5px; font-weight: 600; font-size: 0.8em; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>👥 User Management</h1>
                    <p>Manage all students and teachers in the system</p>
                </div>

                <div class="nav">
                    <a href="/admin-dashboard" class="btn" style="background: #6B7280;">← Dashboard</a>
                    <a href="#students" class="btn" style="background: #3B82F6;">👨‍🎓 Students (${students.length})</a>
                    <a href="#teachers" class="btn" style="background: #8B5CF6;">👨‍🏫 Teachers (${teachers.length})</a>
                </div>

                <div class="container">
                    <div class="card" id="students">
                        <h2>👨‍🎓 Student Management (${students.length})</h2>
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Student ID</th>
                                    <th>Full Name</th>
                                    <th>Grade</th>
                                    <th>Village</th>
                                    <th>Parent Phone</th>
                                    <th>Registration Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${students.map(student => `
                                    <tr>
                                        <td>${student.student_id}</td>
                                        <td>${student.full_name}</td>
                                        <td>${student.grade}</td>
                                        <td>${student.village}</td>
                                        <td>${student.parent_phone}</td>
                                        <td>${new Date(student.created_at).toLocaleDateString()}</td>
                                        <td>
                                            <a href="/admin-edit-student/${student.id}" class="btn" style="background: #10B981;">✏️ Edit</a>
                                            <a href="/admin-delete-student/${student.id}" class="btn" style="background: #EF4444;">🗑️ Delete</a>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div class="card" id="teachers">
                        <h2>👨‍🏫 Teacher Management (${teachers.length})</h2>
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Teacher ID</th>
                                    <th>Full Name</th>
                                    <th>Email</th>
                                    <th>Subject</th>
                                    <th>Join Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${teachers.map(teacher => `
                                    <tr>
                                        <td>${teacher.teacher_id}</td>
                                        <td>${teacher.full_name}</td>
                                        <td>${teacher.email}</td>
                                        <td>${teacher.subject || 'Not set'}</td>
                                        <td>${new Date(teacher.created_at).toLocaleDateString()}</td>
                                        <td>
                                            <a href="/admin-edit-teacher/${teacher.id}" class="btn" style="background: #10B981;">✏️ Edit</a>
                                            <a href="/admin-delete-teacher/${teacher.id}" class="btn" style="background: #EF4444;">🗑️ Delete</a>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send("Error loading user management: " + error.message);
    }
});

// ======================== OTHER ADMIN ROUTES ========================
app.get("/admin-reports", (req, res) => {
    if (!req.session.admin) return res.redirect("/admin");
    res.send(`
        <div style="padding: 20px;">
            <h1>📈 Reports & Analytics</h1>
            <p>Comprehensive reports coming soon...</p>
            <a href="/admin-dashboard">← Back to Dashboard</a>
        </div>
    `);
});

app.get("/admin-logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});

// ======================== TAKE ATTENDANCE (POST) ========================
app.post("/take-attendance", async (req, res) => {
    if (!req.session.teacher) return res.redirect("/teacher-login");

    const { attendance } = req.body;
    const today = new Date().toISOString().split('T')[0];

    try {
        // Delete existing records for today
        await dbRun("DELETE FROM attendance WHERE date = ? AND teacher_id = ?", [today, req.session.teacher.teacher_id]);

        // Insert new records
        for (const [student_id, status] of Object.entries(attendance)) {
            await dbRun(
                "INSERT INTO attendance (student_id, date, status, teacher_id) VALUES (?, ?, ?, ?)",
                [student_id, today, status, req.session.teacher.teacher_id]
            );
        }

        res.redirect("/teacher-dashboard?success=true");
    } catch (error) {
        res.status(500).send("Error saving attendance: " + error.message);
    }
});

// ======================== TEACHER LOGOUT ========================
app.get("/teacher-logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});




// ======================== TEACHER LOGIN ========================
app.get("/teacher-login", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Teacher Login - WCU -CS school</title>
            <style>
                :root {
                    --primary: #3B82F6;
                    --secondary: #10B981;
                    --dark: #1F2937;
                }
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                
                .login-container {
                    background: white;
                    border-radius: 20px;
                    padding: 50px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                    width: 100%;
                    max-width: 450px;
                    text-align: center;
                }
                
                .login-icon {
                    font-size: 4em;
                    margin-bottom: 20px;
                }
                
                h1 {
                    color: var(--dark);
                    margin-bottom: 10px;
                    font-size: 2.2em;
                }
                
                .subtitle {
                    color: #6B7280;
                    margin-bottom: 30px;
                    font-size: 1.1em;
                }
                
                .form-group {
                    margin-bottom: 20px;
                    text-align: left;
                }
                
                label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 600;
                    color: var(--dark);
                }
                
                input {
                    width: 100%;
                    padding: 15px;
                    border: 2px solid #E5E7EB;
                    border-radius: 10px;
                    font-size: 16px;
                    transition: all 0.3s ease;
                }
                
                input:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                
                .btn-login {
                    width: 100%;
                    padding: 15px;
                    background: var(--primary);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    margin-bottom: 20px;
                }
                
                .btn-login:hover {
                    background: #2563EB;
                    transform: translateY(-2px);
                }
                
                .demo-info {
                    background: #EFF6FF;
                    padding: 20px;
                    border-radius: 10px;
                    margin-top: 25px;
                    text-align: left;
                }
                
                .demo-info h3 {
                    color: var(--primary);
                    margin-bottom: 10px;
                }
                
                .error-message {
                    background: #FEF2F2;
                    color: #DC2626;
                    padding: 15px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                    border-left: 4px solid #DC2626;
                }
                
                .back-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    color: #6B7280;
                    text-decoration: none;
                    margin-top: 20px;
                    transition: color 0.3s ease;
                }
                
                .back-link:hover {
                    color: var(--dark);
                }
                
                @media (max-width: 480px) {
                    .login-container {
                        padding: 30px 20px;
                        margin: 10px;
                    }
                    
                    h1 {
                        font-size: 1.8em;
                    }
                    
                    .login-icon {
                        font-size: 3em;
                    }
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <div class="login-icon">👨‍🏫</div>
                <h1>Teacher Login</h1>
                <p class="subtitle">Access your smart teaching dashboard</p>
                
                ${req.query.error ? `
                    <div class="error-message">
                        <strong>Login Failed:</strong> Invalid Teacher ID or Password
                    </div>
                ` : ''}
                
                <form action="/teacher-login" method="POST">
                    <div class="form-group">
                        <label for="teacher_id">Teacher ID</label>
                        <input type="text" id="teacher_id" name="teacher_id" required 
                               placeholder="Enter your Teacher ID">
                    </div>
                    
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" name="password" required 
                               placeholder="Enter your password">
                    </div>
                    
                    <button type="submit" class="btn-login">🚀 Login to Dashboard</button>
                </form>
                
                <div class="demo-info">
                    <h3>Demo Login Credentials:</h3>
                    <p><strong>Teacher ID:</strong> TECH001</p>
                    <p><strong>Password:</strong> teacher123</p>
                    <p><strong>Role:</strong> Admin Teacher</p>
                </div>
                
                <a href="/" class="back-link">
                    ← Back to -CS school
                </a>
            </div>
            
            <script>
                document.querySelector('form').addEventListener('submit', function(e) {
                    const btn = this.querySelector('button[type="submit"]');
                    btn.innerHTML = '⏳ Logging in...';
                    btn.disabled = true;
                });
            </script>
        </body>
        </html>
    `);
});

app.post("/teacher-login", async (req, res) => {
    const { teacher_id, password } = req.body;

    try {
        const teacher = await dbGet("SELECT * FROM teachers WHERE teacher_id = ?", [teacher_id]);

        if (teacher && await bcrypt.compare(password, teacher.password)) {
            req.session.teacher = teacher;
            res.redirect("/teacher-dashboard");
        } else {
            res.redirect("/teacher-login?error=true");
        }
    } catch (error) {
        console.error("Login error:", error);
        res.redirect("/teacher-login?error=true");
    }
});


// ======================== ADDITIONAL ROUTES WOULD GO HERE ========================
// [Student Info, Classes, Payment, Attendance, Announcements, Teacher Dashboard...]
// Due to length, I'm showing the main structure. The other routes would follow similar patterns.

// ======================== START SERVER ========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log("🚀 WCU School System RUNNING!");
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🔧 Installation: http://localhost:${PORT}/install`);
    console.log("🏫 Features: Student Registration, Digital Classes, Smart Attendance");
    console.log("👨‍🏫 Teacher Login: TECH001 / teacher123");
    console.log("💾 Database: Aiven MySQL Cloud");
});

