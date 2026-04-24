<!DOCTYPE html>

<html lang="en">
<head>
<meta charset="UTF-8">
</head>
<body>
<h1>Rollover Budget Pro</h1>
<p>A high-precision financial tracking application designed for multi-year planning. Unlike standard budgeting tools, <strong>Rollover Budget Pro</strong> focuses on "dynamic rollover" logic, helping you visualize how surplus funds move from one month to the next across multiple years.</p>

<h2> Key Features</h2>

<h3>1. Dynamic Rollover Engine</h3>
<ul>
    <li><strong>Starting Balance:</strong> Automatically inherits the previous month's ending balance.</li>
    <li><strong>Paycheck Tracking:</strong> Log individual income entries with specific dates.</li>
    <li><strong>Running Balances:</strong> See a "Balance After" for each paycheck to prevent mid-month deficits.</li>
    <li><strong>Monthly Expenses:</strong> Track one-time costs for specific months.</li>
    <li><strong>Global Recurring Items:</strong> Define fixed costs (like rent or subscriptions) once, and they apply to every month automatically.</li>
</ul>

<h3>2. Multi-Year Planning</h3>
<ul>
    <li><strong>Continuous Timeline:</strong> Add future or past years to see long-term financial health.</li>
    <li><strong>Yearly Summary:</strong> A high-level overview of income, expenses, and savings progress in a clean table format.</li>
</ul>

<h3>3. Modern User Experience</h3>
<ul>
    <li><strong>Soft-Update Logic:</strong> Type smoothly without losing cursor focus.</li>
    <li><strong>Dual-Mode UI:</strong> Supports both Light and Dark themes.</li>
    <li><strong>Responsive Design:</strong> Optimized for both desktop and mobile devices.</li>
    <li><strong>Privacy First:</strong> Currently localized to your browser using <code>localStorage</code>.</li>
</ul>

<h2> Getting Started</h2>

<h3>Current Version (Local)</h3>
<p>Since this is a single-file web application, no complex installation is required:</p>
<ol>
    <li>Download the <code>rollover-budget-app.html</code> file.</li>
    <li>Open it in any modern web browser (Chrome, Firefox, Safari, or Edge).</li>
</ol>

<h2> Cloud Sync & Security</h2>
<p>To support multi-device access and secure data persistence, the project is using a <strong>Serverless Cloud Architecture</strong>.</p>

<h3>Supabase Integration</h3>
<ul>
    <li><strong>Authentication:</strong> Secure user login/signup using Supabase Auth.</li>
    <li><strong>Remote Database:</strong> Migrating <code>localStorage</code> to PostgreSQL tables.</li>
    <li><strong>Row Level Security (RLS):</strong> Policies will be implemented so that a <code>user_id</code> check is performed on every query, ensuring users can only read/write their own budget rows.</li>
    <li><strong>Deployment:</strong> The frontend will be hosted on GitHub Pages, communicating with the Supabase API via the client-side SDK.</li>
</ul>

<h2> Technical Details</h2>
<ul>
    <li><strong>Frontend:</strong> HTML5, CSS3, JavaScript (ES6+).</li>
    <li><strong>Persistence:</strong> Current: Browser <code>localStorage</code> | Planned: Supabase (PostgreSQL).</li>
    <li><strong>Architecture:</strong> Procedural state management with a "Soft-Update" pattern to maintain DOM focus during input.</li>
</ul>

<h2> Safety & Privacy</h2>
<ul>
    <li><strong>Offline Capable:</strong> Current version does not require an internet connection.</li>
    <li><strong>Identity Protection:</strong> Planned cloud version will use encrypted authentication tokens.</li>
    <li><strong>Data Ownership:</strong> Your financial information remains private and secure under your own account.</li>
</ul>

<p><em>Created for healthy financial habits and smart planning.</em></p>


</body>
</html>
