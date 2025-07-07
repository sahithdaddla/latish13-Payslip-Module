const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3089;

// Database configuration
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
});

// Middleware
app.use(cors());
app.use(express.json());
console.log('Serving logo directory:', path.join(__dirname, 'logo'));
app.use('/logo', express.static(path.join(__dirname, 'logo'), {
    setHeaders: function(res, filePath) {
        console.log('Serving static file:', filePath);
    }
}));
app.use('/Employee_Payslip', express.static(path.join(__dirname, 'Employee_Payslip')));
app.use('/HR_Payslip', express.static(path.join(__dirname, 'HR_Payslip')));

// Helper function to validate employee ID
function validateEmployeeId(id) {
    const regex = /^ATS0(?!000)\d{3}$/;
    return regex.test(id);
}

// Helper function to validate PAN
function validatePAN(pan) {
    const regex = /^[A-Z]{5}\d{4}[A-Z]$/;
    return regex.test(pan);
}

// Helper function to validate alphabetic fields with spaces
function validateAlphabeticWithSpaces(input) {
    const regex = /^[A-Za-z]+(?:\s[A-Za-z]+)*$/;
    const alphaCount = (input.match(/[A-Za-z]/g) || []).length;
    const trimmedInput = input.trim();
    return trimmedInput.length >= 5 && trimmedInput.length <= 30 && regex.test(trimmedInput) && alphaCount >= 5;
}

// Helper function to validate bank account number
function validateBankAccount(account) {
    const regex = /^\d{9,16}$/;
    return regex.test(account.trim());
}

// Helper function to validate component name
function validateComponentName(name) {
    return validateAlphabeticWithSpaces(name);
}

// Helper function to calculate LOP deduction
function calculateLOPDeduction(grossPay, workingDays, lop) {
    if (isNaN(grossPay) || isNaN(workingDays) || isNaN(lop) || workingDays === 0) {
        return 0;
    }
    const dailyRate = grossPay / workingDays;
    return Math.round(dailyRate * lop * 100) / 100;
}

// API Endpoints

// Create or Update a Payslip (HR Side)
app.post('/api/payslips', async (req, res) => {
    try {
        console.log('Received POST /api/payslips with body:', JSON.stringify(req.body, null, 2));
        const {
            employeeId, employeeName, designation, dateJoining, monthYear, employeeType,
            location, bankName, accountNo, workingDays, lop, pan, duration,
            earnings, deductions, grossPay, totalDeductions, netPay, providentFund, uan, esic
        } = req.body;

        // Validate required fields
        if (!employeeId || !monthYear) {
            return res.status(400).json({ error: 'Employee ID and Month/Year are required' });
        }

        if (!validateEmployeeId(employeeId)) {
            return res.status(400).json({ error: 'Invalid Employee ID format (e.g., ATS0123)' });
        }

        if (employeeName && !validateAlphabeticWithSpaces(employeeName)) {
            return res.status(400).json({ error: 'Invalid Employee Name (min 5 letters, max 30)' });
        }

        if (designation && !validateAlphabeticWithSpaces(designation)) {
            return res.status(400).json({ error: 'Invalid Designation (min 5 letters, max 30)' });
        }

        if (location && !validateAlphabeticWithSpaces(location)) {
            return res.status(400).json({ error: 'Invalid Location (min 5 letters, max 30)' });
        }

        if (bankName && !validateAlphabeticWithSpaces(bankName)) {
            return res.status(400).json({ error: 'Invalid Bank Name (min 5 letters, max 30)' });
        }

        if (pan && !validatePAN(pan)) {
            return res.status(400).json({ error: 'Invalid PAN format (e.g., ABCDE1234F)' });
        }

        if (accountNo && !validateBankAccount(accountNo)) {
            return res.status(400).json({ error: 'Invalid Bank Account Number (9-16 digits)' });
        }

        if (workingDays && (isNaN(workingDays) || workingDays < 0 || workingDays > 31)) {
            return res.status(400).json({ error: 'Working Days must be between 0 and 31' });
        }

        if (lop && (isNaN(lop) || lop < 0 || lop > 31)) {
            return res.status(400).json({ error: 'LOP must be between 0 and 31' });
        }

        // Validate earnings and deductions
        if (!earnings || earnings.length === 0) {
            return res.status(400).json({ error: 'At least one earning is required' });
        }

        for (const earning of earnings) {
            if (!validateComponentName(earning.component)) {
                return res.status(400).json({ error: `Invalid earning component name: ${earning.component}` });
            }
            if (isNaN(earning.amount) || earning.amount < 0) {
                return res.status(400).json({ error: `Invalid earning amount for ${earning.component}` });
            }
        }

        for (const deduction of deductions) {
            if (!validateComponentName(deduction.component)) {
                return res.status(400).json({ error: `Invalid deduction component name: ${deduction.component}` });
            }
            if (isNaN(deduction.amount) || deduction.amount < 0) {
                return res.status(400).json({ error: `Invalid deduction amount for ${deduction.component}` });
            }
        }

        // Check for duplicate payslip
        const checkQuery = `
            SELECT id FROM payslips 
            WHERE employee_id = $1 AND month_year = $2
        `;
        const checkResult = await pool.query(checkQuery, [employeeId, monthYear]);
        if (checkResult.rows.length > 0) {
            return res.status(400).json({ error: 'Payslip already exists for this Employee ID and Month/Year' });
        }

        // Insert new payslip
        const insertQuery = `
            INSERT INTO payslips (
                employee_id, employee_name, designation, date_joining, month_year, 
                employee_type, location, bank_name, account_no, working_days, lop, 
                pan, duration, earnings, deductions, gross_pay, total_deductions, 
                net_pay, provident_fund, uan, esic, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
            RETURNING id
        `;
        const values = [
            employeeId, employeeName || null, designation || null, dateJoining || null, monthYear,
            employeeType || null, location || null, bankName || null, accountNo || null, 
            workingDays || null, lop || 0, pan || null, duration || null, 
            JSON.stringify(earnings), JSON.stringify(deductions), grossPay, 
            totalDeductions, netPay, providentFund || null, uan || null, esic || null, 
            new Date().toISOString()
        ];

        const result = await pool.query(insertQuery, values);
        res.status(201).json({ id: result.rows[0].id, message: 'Payslip created successfully' });
    } catch (error) {
        console.error('Error creating payslip:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

// Get Payslips for Employee (Employee Side)
app.get('/api/payslips', async (req, res) => {
    try {
        console.log('Received GET /api/payslips with query:', req.query);
        const { employeeId, month, year } = req.query;

        if (!employeeId || !month || !year) {
            return res.status(400).json({ error: 'Employee ID, month, and year are required' });
        }

        if (!validateEmployeeId(employeeId)) {
            return res.status(400).json({ error: 'Invalid Employee ID format (e.g., ATS0123)' });
        }

        const monthYear = `${year}-${month.padStart(2, '0')}`;
        const query = `
            SELECT * FROM payslips 
            WHERE employee_id = $1 AND month_year LIKE $2
        `;
        const result = await pool.query(query, [employeeId, `${monthYear}%`]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No payslips found' });
        }

        const payslip = result.rows[0];
        res.json({
            id: payslip.id,
            employeeId: payslip.employee_id,
            employeeName: payslip.employee_name,
            designation: payslip.designation,
            dateJoining: payslip.date_joining,
            monthYear: payslip.month_year,
            monthYearFormatted: formatMonthYear(payslip.month_year),
            employeeType: payslip.employee_type,
            location: payslip.location,
            bankName: payslip.bank_name,
            accountNo: payslip.account_no,
            workingDays: payslip.working_days,
            daysInMonth: getDaysInMonth(payslip.month_year),
            lop: payslip.lop,
            pan: payslip.pan,
            duration: payslip.duration,
            earnings: payslip.earnings,
            deductions: payslip.deductions,
            grossPay: Number(payslip.gross_pay),
            totalDeductions: Number(payslip.total_deductions),
            netPay: Number(payslip.net_pay),
            providentFund: payslip.provident_fund,
            uan: payslip.uan,
            esic: payslip.esic
        });
    } catch (error) {
        console.error('Error fetching payslip:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

// Get All Payslips (HR Side)
app.get('/api/payslips/all', async (req, res) => {
    try {
        console.log('Received GET /api/payslips/all');
        const query = 'SELECT * FROM payslips ORDER BY created_at DESC';
        const result = await pool.query(query);
        const payslips = result.rows.map(payslip => ({
            id: payslip.id,
            employeeId: payslip.employee_id,
            employeeName: payslip.employee_name,
            monthYear: payslip.month_year,
            monthYearFormatted: formatMonthYear(payslip.month_year),
            netPay: Number(payslip.net_pay),
            createdAt: payslip.created_at
        }));
        res.json(payslips);
    } catch (error) {
        console.error('Error fetching payslips:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

// Get a Single Payslip by ID (HR Side)
app.get('/api/payslips/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Received GET /api/payslips/:id with id:', id);
        const query = `
            SELECT * FROM payslips 
            WHERE id = $1
        `;
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Payslip not found' });
        }

        const payslip = result.rows[0];
        res.json({
            id: payslip.id,
            employee_id: payslip.employee_id,
            employee_name: payslip.employee_name,
            designation: payslip.designation,
            date_joining: payslip.date_joining,
            month_year: payslip.month_year,
            employee_type: payslip.employee_type,
            location: payslip.location,
            bank_name: payslip.bank_name,
            account_no: payslip.account_no,
            working_days: payslip.working_days,
            lop: payslip.lop,
            pan: payslip.pan,
            duration: payslip.duration,
            earnings: payslip.earnings,
            deductions: payslip.deductions,
            gross_pay: Number(payslip.gross_pay),
            total_deductions: Number(payslip.total_deductions),
            net_pay: Number(payslip.net_pay),
            provident_fund: payslip.provident_fund,
            uan: payslip.uan,
            esic: payslip.esic
        });
    } catch (error) {
        console.error('Error fetching payslip:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

// Delete a Payslip (HR Side)
app.delete('/api/payslips/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Received DELETE /api/payslips/:id with id:', id);
        const query = 'DELETE FROM payslips WHERE id = $1';
        const result = await pool.query(query, [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Payslip not found' });
        }
        res.json({ message: 'Payslip deleted successfully' });
    } catch (error) {
        console.error('Error deleting payslip:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

// Helper function to format month-year
function formatMonthYear(monthYear) {
    if (!monthYear) return '';
    const [year, month] = monthYear.split('-');
    const date = new Date(year, parseInt(month) - 1);
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    return `${monthNames[date.getMonth()]} ${year}`;
}

// Helper function to get days in month
function getDaysInMonth(monthYear) {
    const [year, month] = monthYear.split('-').map(Number);
    return new Date(year, month, 0).getDate();
}

// Error handling for database connection
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://13.60.88.230:${port}`);
});