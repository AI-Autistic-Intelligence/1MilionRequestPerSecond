const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Load the HTML file
    await page.goto('file://' + __dirname + '/detailed_report.html', { waitUntil: 'networkidle0', timeout: 120000 });
    
    // Generate PDF
    await page.pdf({
        path: 'detailed_report.pdf',
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
    });
    
    await browser.close();
    console.log("PDF generated at detailed_report.pdf");
})();
