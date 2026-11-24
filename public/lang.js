(() => {
  'use strict';

  const divisions = [
    ["96","කෙහෙලත්තාවෙල","கெஹெலத்தாவெல","Kehelaththawela"],
    ["96/A","කරගහවෙල බටහිර","கரகஹவெல மேற்கு","Karagahawela West"],
    ["96/B","කරගහවෙල නැගෙනහිර","கரகஹவெல கிழக்கு","Karagahawela East"],
    ["97","කොටගම","கொட்டகம","Kotagama"],
    ["97/A","එගොඩ කොටගම","எகொட கொட்டகம","Egoda Kotagama"],
    ["98","යල්කුඹුර","யல்கும்புர","Yalkumbura"],
    ["98/A","ඇතනාවත්ත","எத்தனாவத்த","Ethanawaththa"],
    ["98/B","මුදියල","முதியல","Mudiyala"],
    ["98/C","තානායම්ගම","தானாயம்கம","Thanayamgama"],
    ["99","දොඩම්ගොල්ල","தொடம்கொல்ல","Dodamgolla"],
    ["99/A","කණුල්වෙල","கணுல்வெல","Kanulwela"],
    ["99/B","දෙහිඅත්තාවෙල","தெஹிஅத்தாவெல","Dehiaththawela"],
    ["99/C","මැදපිටිය","மெதபிட்டிய","Medapitiya"],
    ["100","බිබිල","பிபிலை","Bibile"],
    ["100/A","කුරුවම්බ","குருவம்ப","Kuruwamba"],
    ["100/B","රතුපස්කැටිය","ரதுபஸ்கெட்டிய","Rathupasketiya"],
    ["100/C","අඹේලන්ද","அம்பேலந்த","Ambelanda"],
    ["100/D","කවුඩැල්ල","கவுடெல்ல","Kaudella"],
    ["100/E","හෙවෙල්වෙල","ஹெவெல்வெல","Hewelwela"],
    ["100/F","බදුල්ලගම්මන","பதுளைகம்மன","Badullagammana"],
    ["101","බෝකගොන්න","போககொன்ன","Bokagonna"],
    ["101/A","පිටකුඹුර","பிட்டகும்புர","Pitakumbura"],
    ["101/B","නාගල","நாகல","Nagala"],
    ["101/C","ලිඳකුඹුර","லிந்தகும்புர","Lindakumbura"],
    ["101/D","කොකුන්නෑව","கொகுன்னேவ","Kokunnawa"],
    ["101/E","මොරත්තමුල්ල","மொரத்தமுல்ல","Moraththamulla"],
    ["102","වෑගම උතුර","வேகம வடக்கு","Wegama North"],
    ["102/A","රදලියද්ද","ரதலியத்த","Radaliyadda"],
    ["102/B","මල්ලහැව","மல்லஹெவ","Mallahawa"],
    ["102/C","වෑගම දකුණ","வேகம தெற்கு","Wegama South"],
    ["102/D","අඹගොල්ල","அம்பகொல்ல","Ambagolla"],
    ["102/E","උස්සාගල","உஸ்ஸாகல","Ussagala"],
    ["102/F","කනවේගල්ල","கனவேகல்ல","Kanawegalla"],
    ["102/G","උඩ මල්ලහැව","உட மல்லஹெவ","Uda Mallahewa"],
    ["103","නිල්ගල","நில்கல","Nilgala"],
    ["103/A","හමපොල","ஹமபொல","Hamapola"],
    ["103/B","බුළුපිටිය","புலுபிட்டிய","Bulupitiya"],
    ["103/C","තොටිල්ලකැටිය","தொட்டில்லகெட்டிய","Thotillaketiya"],
    ["103/D","කරඬුගල","கரண்டுகல","Karandugala"],
    ["103/E","ඌරාවුල","ஊராவுல","Uraula"],
  ];
  const divisionLabels = Object.fromEntries(divisions.map(([code, si, ta, en]) => [
    'divisions.' + en, [si, ta, en].map(name => code + ' — ' + name)
  ]));

  const dictionary = {
    "history.response": ["නිලධාරී ප්‍රතිචාරය","அலுவலரின் பதில்","Officer response"],
    "history.status": ["තත්ත්වය","நிலை","Status"],
    "history.loading": ["පැමිණිල්ලේ ඉතිහාසය පූරණය වෙමින් පවතී…","முறைப்பாட்டு வரலாறு ஏற்றப்படுகிறது…","Loading complaint history…"],
    "report.byResponse": ["නිලධාරී ප්‍රතිචාරය අනුව පැමිණිලි","அலுவலரின் பதில் வாரியான முறைப்பாடுகள்","Complaints by officer response"],
    "report.invalidRange": ["ආරම්භක දිනය හෝ ඊට පසු දිනයක් අවසන් දිනය ලෙස තෝරන්න.","தொடக்கத் தேதி அல்லது அதற்குப் பிந்தைய தேதியை முடிவுத் தேதியாகத் தேர்ந்தெடுக்கவும்.","Choose an end date on or after the start date."],
    "report.responded": ["ප්‍රතිචාර දී ඇත","பதிலளிக்கப்பட்டது","Responded"],
    "report.unresponded": ["ප්‍රතිචාරයක් අපේක්ෂාවෙන්","பதிலுக்காகக் காத்திருக்கிறது","Awaiting response"],
    "report.run": ["වාර්තාව සකසන්න","அறிக்கையை உருவாக்கவும்","Run report"],
    "report.pdf": ["PDF බාගන්න","PDF பதிவிறக்கவும்","Download PDF"],
    "report.xlsx": ["XLSX බාගන්න","XLSX பதிவிறக்கவும்","Download XLSX"],
    "report.csv": ["CSV බාගන්න","CSV பதிவிறக்கவும்","Download CSV"],
    "report.updatedAt": ["යාවත්කාලීන කළ දිනය","புதுப்பித்த தேதி","Updated"],
    "bin.trash": ["ඉවත් කළ පැමිණිලි වෙත ගෙන යන්න","மறுசுழற்சித் தொட்டிக்கு நகர்த்தவும்","Move to Recycle Bin"],
    "bin.purge": ["ස්ථිරව මකන්න","நிரந்தரமாக நீக்கவும்","Permanently delete"],
    "bin.warning": ["තෝරාගත් පැමිණිල්ල සහ එහි ඇමුණුම් ස්ථිරව මැකෙනු ඇත.","தேர்ந்தெடுத்த முறைப்பாடும் அதன் இணைப்புகளும் நிரந்தரமாக நீக்கப்படும்.","This permanently deletes the selected complaint and its attachments."],
    "bin.confirm": ["ස්ථිරව මැකීම තහවුරු කරමි","நிரந்தர நீக்கத்தை உறுதிப்படுத்துகிறேன்","I confirm permanent deletion"],
    "report.title": ["පැමිණිලි වාර්තා","முறைப்பாட்டு அறிக்கைகள்","Complaint reports"],
    "report.filters": ["වාර්තා පෙරහන්","அறிக்கை வடிகட்டிகள்","Report filters"],
    "report.generated": ["සකස් කළ දිනය","உருவாக்கிய தேதி","Generated"],
    "report.any": ["සියල්ල","அனைத்தும்","All"],
    "report.from": ["ආරම්භක දිනය","தொடக்கத் தேதி","From date"],
    "report.to": ["අවසන් දිනය","முடிவுத் தேதி","To date"],
    "report.apply": ["පෙරහන් යොදන්න","வடிகட்டிகளைப் பயன்படுத்தவும்","Apply filters"],
    "report.reset": ["පෙරහන් ඉවත් කරන්න","வடிகட்டிகளை நீக்கவும்","Clear filters"],
    "report.export": ["වාර්තාව අපනයනය කරන්න","அறிக்கையை ஏற்றுமதி செய்யவும்","Export report"],
    "report.response": ["නිලධාරී ප්‍රතිචාරයක් තිබේද?","அலுவலரின் பதில் உள்ளதா?","Officer response available"],
    "report.byCategory": ["කාණ්ඩය අනුව පැමිණිලි","பிரிவு வாரியான முறைப்பாடுகள்","Complaints by category"],
    "report.byDivision": ["වසම අනුව පැමිණිලි","கிராம அலுவலர் பிரிவு வாரியான முறைப்பாடுகள்","Complaints by GN division"],
    "report.byStatus": ["තත්ත්වය අනුව පැමිණිලි","நிலை வாரியான முறைப்பாடுகள்","Complaints by status"],
    "report.empty": ["මෙම පෙරහන්වලට ගැළපෙන පැමිණිලි නැත.","இந்த வடிகட்டிகளுக்குப் பொருந்தும் முறைப்பாடுகள் இல்லை.","No complaints match these filters."],
    "common.yes": ["ඔව්","ஆம்","Yes"],
    "common.no": ["නැත","இல்லை","No"],
    "bin.title": ["ඉවත් කළ පැමිණිලි","நீக்கப்பட்ட முறைப்பாடுகள்","Recycle bin"],
    "bin.move": ["ඉවත් කළ පැමිණිලි වෙත ගෙන යන්න","மறுசுழற்சித் தொட்டிக்கு நகர்த்தவும்","Move to recycle bin"],
    "bin.restore": ["නැවත ලබා ගන්න","மீட்டெடுக்கவும்","Restore"],
    "bin.empty": ["ඉවත් කළ පැමිණිලි නැත.","நீக்கப்பட்ட முறைப்பாடுகள் இல்லை.","The recycle bin is empty."],
    "bin.deletedAt": ["ඉවත් කළ දිනය","நீக்கப்பட்ட தேதி","Date removed"],
    "history.title": ["පැමිණිල්ලේ ප්‍රගතිය","முறைப்பாட்டின் முன்னேற்றம்","Complaint progress history"],
    "history.submitted": ["පැමිණිල්ල ඉදිරිපත් කරන ලදී","முறைப்பாடு சமர்ப்பிக்கப்பட்டது","Complaint submitted"],
    "history.updated": ["ප්‍රගතිය යාවත්කාලීන කරන ලදී","முன்னேற்றம் புதுப்பிக்கப்பட்டது","Progress updated"],
    "history.empty": ["ප්‍රගති යාවත්කාලීන කිරීම් නැත.","முன்னேற்றப் புதுப்பிப்புகள் இல்லை.","No progress updates."],
    ...divisionLabels,
    'site.name': ['බිබිල ප්‍රාදේශීය සභාව', 'பிபிலை பிரதேச சபை', 'Bibile Pradeshiya Sabha'],
    'contact.address': ['ප්‍රධාන වීදිය, බිබිල', 'பிரதான வீதி, பிபிலை', 'Main Street, Bibile'],
    'contact.phone': ['දුරකථන', 'தொலைபேசி', 'Phone'],
    'contact.website': ['වෙබ් අඩවිය', 'இணையதளம்', 'Website'],
    'contact.email': ['ඊමේල්', 'மின்னஞ்சல்', 'Email'],
    'hero.title': ['පුරවැසි පැමිණිලි හා සේවා', 'குடிமக்கள் முறைப்பாடுகளும் சேவைகளும்', 'Citizen Complaints & Services'],
    'hero.subtitle': ['පැමිණිල්ලක් ඉදිරිපත් කර එහි තත්ත්වය පරීක්ෂා කරන්න.', 'முறைப்பாட்டைச் சமர்ப்பித்து அதன் நிலையைக் கண்காணிக்கவும்.', 'Submit a complaint and track its progress.'],
    'form.address': ['ලිපිනය / ස්ථානය', 'முகவரி / சரியான இடம்', 'Address / Exact Location'],
    'status.Pending': ['සලකා බැලීමට නියමිතයි', 'நிலுவையில்', 'Pending'],
    'status.In Progress': ['කටයුතු සිදු වෙමින් පවතී', 'செயல்பாட்டில்', 'In Progress'],
    'status.Resolved': ['විසඳා ඇත', 'தீர்க்கப்பட்டது', 'Resolved'],
    'categories.Street Lights': ['වීදි පහන්', 'தெரு விளக்குகள்', 'Street Lights'],
    'categories.Garbage Collection': ['කසළ රැස් කිරීම', 'கழிவு சேகரிப்பு', 'Garbage Collection'],
    'categories.Roads & Drains': ['මාර්ග සහ කාණු', 'வீதிகள் மற்றும் வடிகால்கள்', 'Roads & Drains'],
    'categories.Water Supply': ['ජල සැපයුම', 'நீர் விநியோகம்', 'Water Supply'],
    'categories.Building Approvals': ['ගොඩනැගිලි අනුමැතිය', 'கட்டட அனுமதிகள்', 'Building Approvals'],
    'categories.Public Library Services': ['මහජන පුස්තකාල සේවා', 'பொது நூலகச் சேவைகள்', 'Public Library Services'],
    'categories.Preschools': ['පෙරපාසල්', 'முன்பள்ளிகள்', 'Preschools'],
    'categories.Ayurvedic Services': ['ආයුර්වේද සේවා', 'ஆயுர்வேத சேவைகள்', 'Ayurvedic Services'],
    'categories.Crematorium Services': ['ආදාහනාගාර සේවා', 'தகனசாலை சேவைகள்', 'Crematorium Services'],
    'categories.Hall Facilities': ['ශාලා පහසුකම්', 'மண்டப வசதிகள்', 'Hall Facilities'],
    'categories.Sports Grounds': ['ක්‍රීඩාංගන', 'விளையாட்டு மைதானங்கள்', 'Sports Grounds'],
    'categories.Water Bowser': ['ජල බවුසර්', 'நீர் பவுசர் சேவை', 'Water Bowser'],
    'categories.Gully Bowser': ['ගලි බවුසර්', 'கழிவுநீர் பவுசர் சேவை', 'Gully Bowser'],
    'categories.Property Rates': ['වරිපනම්', 'சொத்து வரி', 'Property Rates'],
    'categories.Other': ['වෙනත්', 'ஏனையவை', 'Other'],
    'divisions.Bibile Town': ['බිබිල නගරය', 'பிபிலை நகரம்', 'Bibile Town'],
    'divisions.Kanawarella': ['කනවරැල්ල', 'கனவரெல்ல', 'Kanawarella'],
    'divisions.Wegama': ['වේගම', 'வேகம', 'Wegama'],
    "form.name": ["නම","பெயர்","Name"],
    "form.phone": ["දුරකථන අංකය","தொலைபேசி எண்","Phone number"],
    "form.email": ["විද්‍යුත් තැපැල් ලිපිනය","மின்னஞ்சல் முகவரி","Email address"],
    "form.division": ["ග්‍රාම නිලධාරී වසම","கிராம அலுவலர் பிரிவு","GN division"],
    "form.category": ["සේවා කාණ්ඩය","சேவைப் பிரிவு","Service category"],
    "form.description": ["පැමිණිල්ලේ විස්තර","முறைப்பாட்டின் விவரம்","Complaint details"],
    "form.submit": ["පැමිණිල්ල යොමු කරන්න","முறைப்பாட்டைச் சமர்ப்பிக்கவும்","Submit complaint"],
    "nav.officer": ["නිලධාරී පිවිසුම","அலுவலர் உள்நுழைவு","Officer Login"],
    "admin.title": ["නිලධාරී පුවරුව","அலுவலர் கட்டுப்பாட்டுப் பலகை","Officer dashboard"],
    "admin.login": ["පිවිසෙන්න","உள்நுழையவும்","Sign in"],
    "admin.logout": ["ඉවත් වන්න","வெளியேறவும்","Sign out"],
    "admin.username": ["පරිශීලක නාමය","பயனர்பெயர்","Username"],
    "admin.password": ["මුරපදය","கடவுச்சொல்","Password"],
    "receipt.title": ["පැමිණිල්ල ලැබුණි","முறைப்பாடு பெறப்பட்டது","Complaint received"],
    "receipt.print": ["ලදුපත මුද්‍රණය කරන්න","பற்றுச்சீட்டை அச்சிடவும்","Print receipt"],
    "receipt.reference": ["යොමු අංකය","குறிப்பு எண்","Reference number"],
    "receipt.date": ["ඉදිරිපත් කළ දිනය","சமர்ப்பித்த தேதி","Date submitted"],
    "receipt.keep": ["පැමිණිල්ලේ තත්ත්වය පරීක්ෂා කිරීමට මෙම අංකය සුරකින්න.","முறைப்பாட்டின் நிலையைக் கண்காணிக்க இந்த எண்ணைப் பாதுகாக்கவும்.","Keep this number to track your complaint."],
    "ticket.title": ["පැමිණිල්ල ලැබුණි","முறைப்பாடு பெறப்பட்டது","Complaint received"],
    "common.close": ["වසන්න","மூடவும்","Close"],
    "common.status": ["තත්ත්වය","நிலை","Status"],
    "common.loading": ["පූරණය වෙමින් පවතී…","ஏற்றப்படுகிறது…","Loading…"],
    "common.error": ["දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.","பிழை ஏற்பட்டது. மீண்டும் முயலவும்.","Something went wrong. Please try again."],
    "track.title": ["පැමිණිල්ලේ තත්ත්වය බලන්න","முறைப்பாட்டின் நிலையைக் கண்காணிக்கவும்","Track a complaint"],
    "track.submit": ["තත්ත්වය බලන්න","நிலையைப் பார்க்கவும்","Check status"],
    "track.notFound": ["එම යොමු අංකයට අදාළ පැමිණිල්ලක් හමු නොවීය.","அந்தக் குறிப்பு எண்ணுக்கான முறைப்பாடு கிடைக்கவில்லை.","No complaint found for that reference number."],
    "footer.rights": ["සියලු හිමිකම් ඇවිරිණි.","அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.","All rights reserved."],
    "citizen.title": ["පුරවැසි පැමිණිලි සහ සේවා නිරීක්ෂණය","குடிமக்கள் முறைப்பாடு மற்றும் சேவைக் கண்காணிப்பு","Citizen complaint and service tracker"],
    "citizen.intro": ["ප්‍රදේශයේ ගැටලුවක් දැනුම් දෙන්න හෝ කලින් යොමු කළ පැමිණිල්ලක තත්ත්වය බලන්න.","உள்ளூர்ப் பிரச்சினையைத் தெரிவிக்கவும் அல்லது ஏற்கெனவே சமர்ப்பித்த முறைப்பாட்டின் நிலையைக் கண்காணிக்கவும்.","Report a local issue or check progress on an existing complaint."],
    "stats.title": ["පැමිණිලි සංඛ්‍යාලේඛන","முறைப்பாட்டுப் புள்ளிவிவரங்கள்","Complaint statistics"],
    "stats.total": ["මුළු පැමිණිලි","மொத்த முறைப்பாடுகள்","Total complaints"],
    "complaint.title": ["පැමිණිල්ලක් ඉදිරිපත් කරන්න","முறைப்பாட்டைச் சமர்ப்பிக்கவும்","Submit a complaint"],
    "field.nic": ["ජාතික හැඳුනුම්පත් අංකය (විකල්පයි)","தேசிய அடையாள அட்டை எண் (விருப்பத்திற்குரியது)","NIC number (optional)"],
    "field.photo": ["ඡායාරූපය (විකල්පයි)","புகைப்படம் (விருப்பத்திற்குரியது)","Photo (optional)"],
    "form.select": ["විකල්පයක් තෝරන්න","ஓர் விருப்பத்தைத் தேர்ந்தெடுக்கவும்","Select an option"],
    "track.ticketQuery": ["පැමිණිලි අංකය", "முறைப்பாட்டு எண்", "Ticket ID"],
    "track.ticketPlaceholder": ["පැමිණිලි අංකය ඇතුළත් කරන්න", "முறைப்பாட்டு எண்ணை உள்ளிடவும்", "Enter ticket ID"],
    "attachment.delete": ["ඡායාරූපය ඉවත් කරන්න","படத்தை நீக்கு","Delete photo"],
    "attachment.confirm": ["මෙම ඡායාරූපය පැමිණිල්ලෙන් ඉවත් කර Drive බඳුනට යවන්නද?","படத்தை முறைப்பாட்டிலிருந்து நீக்கி Drive குப்பைக்கு நகர்த்தவா?","Remove this photo from the complaint and move it to Drive trash?"],
    "report.preparing": ["වාර්තාව සකසමින්…","அறிக்கை தயாராகிறது…","Preparing the report…"],
    "static.reference": ["පැමිණිලි අංකය","முறைப்பாட்டு எண்","Reference number"],
    "static.referencePlaceholder": ["පැමිණිලි අංකය ඇතුළත් කරන්න","முறைப்பாட்டு எண்ணை உள்ளிடவும்","Enter the reference number"],
    "static.setup": ["පැමිණිලි සේවාව තවම සකසා නැහැ.","முறைப்பாட்டுச் சேவை இன்னும் அமைக்கப்படவில்லை.","The complaint service has not been configured."],
    "static.photoSize": ["2 MB දක්වා ඡායාරූපයක් භාවිත කරන්න.","2 MB வரையிலான படத்தைப் பயன்படுத்தவும்.","Use a photo up to 2 MB."],
    "static.session": ["පිටුව යළි පූරණය කර නැවත පිවිසෙන්න.","பக்கத்தை மீளேற்றி மீண்டும் உள்நுழையவும்.","Reload the page and sign in again."],
    "track.query": ["පැමිණිලි අංකය හෝ දුරකථන අංකය","முறைப்பாட்டு எண் அல்லது தொலைபேசி எண்","Ticket ID or phone number"],
    "track.placeholder": ["පැමිණිලි අංකය හෝ දුරකථන අංකය ඇතුළත් කරන්න","முறைப்பாட்டு எண் அல்லது தொலைபேசி எண்ணை உள்ளிடவும்","Enter ticket ID or phone number"],
    "field.ticket": ["පැමිණිලි අංකය","முறைப்பாட்டு எண்","Ticket ID"],
    "receipt.copy": ["පැමිණිලි අංකය පිටපත් කරන්න","முறைப்பாட்டு எண்ணை நகலெடுக்கவும்","Copy ticket ID"],
    "staff.filters": ["පෙරහන්","வடிகட்டிகள்","Filters"],
    "staff.all": ["සියල්ල","அனைத்தும்","All"],
    "staff.export": ["CSV ගොනුවක් ලෙස ලබා ගන්න","CSV கோப்பாக ஏற்றுமதி செய்யவும்","Export CSV"],
    "staff.complaints": ["පැමිණිලි","முறைப்பாடுகள்","Complaints"],
    "field.createdAt": ["ඉදිරිපත් කළ දිනය","சமர்ப்பித்த தேதி","Submitted"],
    "staff.actions": ["ක්‍රියා","செயல்கள்","Actions"],
    "field.remarks": ["නිලධාරියාගේ සටහන්","அலுவலரின் குறிப்புகள்","Officer remarks"],
    "field.proof": ["විසඳුම පෙන්වන ඡායාරූපය","தீர்வைக் காட்டும் புகைப்படம்","Resolution photo"],
    "staff.save": ["වෙනස්කම් සුරකින්න","மாற்றங்களைச் சேமிக்கவும்","Save changes"],
    "stats.pending": ["සලකා බැලීමට නියමිතයි","நிலுவையில்","Pending"],
    "stats.inProgress": ["කටයුතු සිදු වෙමින් පවතී","செயல்பாட்டில்","In progress"],
    "stats.resolved": ["විසඳා ඇත","தீர்க்கப்பட்டது","Resolved"],
    "field.address": ["ලිපිනය / ස්ථානය","முகவரி / சரியான இடம்","Address / Exact Location"],
    "staff.invalidLogin": ["පරිශීලක නාමය හෝ මුරපදය වැරදියි.","பயனர்பெயர் அல்லது கடவுச்சொல் தவறானது.","Incorrect username or password."],
    "track.originalPhoto": ["පැමිණිල්ල සමඟ යොමු කළ ඡායාරූපය","முறைப்பாட்டுடன் சமர்ப்பித்த புகைப்படம்","Photo submitted with the complaint"],
    "track.empty": ["ගැළපෙන පැමිණිලි හමු නොවීය.","பொருந்தும் முறைப்பாடுகள் கிடைக்கவில்லை.","No matching complaints found."],
    "receipt.copied": ["පැමිණිලි අංකය පිටපත් කරන ලදී.","முறைப்பாட்டு எண் நகலெடுக்கப்பட்டது.","Ticket ID copied."],
    "receipt.copyError": ["පැමිණිලි අංකය පිටපත් කළ නොහැකි විය.","முறைப்பாட்டு எண்ணை நகலெடுக்க முடியவில்லை.","Could not copy the ticket ID."],
    "staff.empty": ["ගැළපෙන පැමිණිලි නැත.","பொருந்தும் முறைப்பாடுகள் இல்லை.","No matching complaints."],
    "staff.view": ["විස්තර බලන්න","விவரங்களைப் பார்க்கவும்","View details"],
    "staff.refreshError": ["පැමිණිලි ලැයිස්තුව පූරණය කළ නොහැකි විය.","முறைப்பாட்டுப் பட்டியலை ஏற்ற முடியவில்லை.","Could not load the complaints list."],
    "field.name": ["නම","பெயர்","Name"],
    "field.phone": ["දුරකථන අංකය","தொலைபேசி எண்","Phone number"],
    "field.division": ["ග්‍රාම නිලධාරී වසම","கிராம அலுவலர் பிரிவு","GN division"],
    "field.category": ["සේවා කාණ්ඩය","சேவைப் பிரிவு","Service category"],
    "field.description": ["පැමිණිල්ලේ විස්තර","முறைப்பாட்டின் விவரம்","Complaint details"],
    "complaint.submit": ["පැමිණිල්ල යොමු කරන්න","முறைப்பாட்டைச் சமர்ப்பிக்கவும்","Submit complaint"],
    "staff.login": ["නිලධාරී පිවිසුම","அலுவலர் உள்நுழைவு","Officer Login"],
    "staff.title": ["නිලධාරී පුවරුව","அலுவலர் கட்டுப்பாட்டுப் பலகை","Officer dashboard"],
    "field.username": ["පරිශීලක නාමය","பயனர்பெயர்","Username"],
    "field.password": ["මුරපදය","கடவுச்சொல்","Password"],
    "staff.signIn": ["පිවිසෙන්න","உள்நுழையவும்","Sign in"],
    "staff.signOut": ["ඉවත් වන්න","வெளியேறவும்","Sign out"],
    "field.status": ["තත්ත්වය","நிலை","Status"],
    "staff.details": ["පැමිණිල්ලේ විස්තර","முறைப்பாட்டின் விவரம்","Complaint details"],
  };

  const languageIndex = { si: 0, ta: 1, en: 2 };
  const bindings = [
    ['data-i18n', 'textContent'],
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-title', 'title'],
    ['data-i18n-aria-label', 'aria-label'],
  ];
  const gnDivisions = Object.freeze(divisions.map(([, , , name]) => name));
  const categoryPrefix = 'categories.';
  const serviceCategories = Object.freeze(Object.keys(dictionary)
    .filter(key => key.startsWith(categoryPrefix))
    .map(key => key.slice(categoryPrefix.length)));

  let language = 'si';

  function translate(locale, key, params = {}) {
    const index = Object.hasOwn(languageIndex, locale) ? languageIndex[locale] : languageIndex.si;
    const message = Object.hasOwn(dictionary, key) ? dictionary[key][index] : key;
    return String(message).replace(/\{([\w.-]+)\}/g, (token, name) =>
      Object.hasOwn(params, name) ? String(params[name]) : token
    );
  }

  const sinhalaGregorianMonths = [
    'ජනවාරි', 'පෙබරවාරි', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි',
    'ජූලි', 'අගෝස්තු', 'සැප්තැම්බර්', 'ඔක්තෝබර්', 'නොවැම්බර්', 'දෙසැම්බර්'
  ];
  const sriLankaTimeZone = 'Asia/Colombo';
  const dayParts = new Intl.DateTimeFormat('en-LK', {
    calendar: 'gregory', timeZone: sriLankaTimeZone, year: 'numeric', month: 'numeric', day: 'numeric'
  });
  const sinhalaClock = new Intl.DateTimeFormat('si-LK', {
    timeZone: sriLankaTimeZone, timeStyle: 'short'
  });
  const regionalDates = Object.fromEntries(['ta', 'en'].map(code => [
    code, [true, false].map(dateOnly => new Intl.DateTimeFormat(code + '-LK', {
      calendar: 'gregory', timeZone: sriLankaTimeZone, dateStyle: 'medium',
      ...(dateOnly ? {} : { timeStyle: 'short' })
    }))
  ]));

  function formatTrackerDate(locale, value, { dateOnly = false } = {}) {
    if (!value) return '';
    const timestamp = new Date(value);
    if (!Number.isFinite(timestamp.valueOf())) return '';
    if (Object.hasOwn(regionalDates, locale)) {
      return regionalDates[locale][dateOnly ? 0 : 1].format(timestamp);
    }
    const { year, month, day } = Object.fromEntries(dayParts.formatToParts(timestamp)
      .map(({ type, value: part }) => [type, part]));
    const date = year + ' ' + sinhalaGregorianMonths[Number(month) - 1] + ' ' + day;
    return dateOnly ? date : date + ' · ' + sinhalaClock.format(timestamp);
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { translate, formatTrackerDate, gnDivisions, serviceCategories };
    return;
  }

  function t(key, params) {
    return translate(language, key, params);
  }

  function applyTranslations(root = document) {
    for (const [source, target] of bindings) {
      const selector = '[' + source + ']';
      const elements = Array.from(root.querySelectorAll(selector));
      if (root.matches?.(selector)) elements.unshift(root);
      for (const element of elements) {
        const key = element.getAttribute(source);
        if (!Object.hasOwn(dictionary, key)) continue;
        const message = t(key);
        if (target === 'textContent') element.textContent = message;
        else element.setAttribute(target, message);
      }
    }
  }

  function setLanguage(next) {
    if (!Object.hasOwn(languageIndex, next)) return;
    language = next;
    document.documentElement.lang = language;
    applyTranslations();
    document.dispatchEvent(new CustomEvent('languagechange', { detail: { language } }));
  }

  window.formatTrackerDate = formatTrackerDate;
  window.gnDivisions = gnDivisions;
  window.serviceCategories = serviceCategories;
  window.t = t;
  window.setLanguage = setLanguage;
  window.getLanguage = () => language;
  window.applyTranslations = applyTranslations;
  document.documentElement.lang = language;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setLanguage(language), { once: true });
  } else {
    setLanguage(language);
  }
})();
