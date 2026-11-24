const form=document.querySelector('#feedback-form');
const fields=[...form.querySelectorAll('input[required], textarea[required]')];
function validate(){fields.forEach(field=>field.setCustomValidity(field.value.trim()?'':'Please enter a title or description.'));return form.reportValidity();}
fields.forEach(field=>field.addEventListener('input',()=>field.setCustomValidity(field.value.trim()?'':'Please enter a title or description.')));
form.addEventListener('submit',event=>{
 event.preventDefault();if(!validate())return;
 const subject=document.querySelector('#feedback-title').value.trim();
 const message=document.querySelector('#feedback-description').value.trim();
 window.location.href='mailto:support@veloratv.app?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(message);
 document.querySelector('#email-status').textContent='Your email app should open with a draft. Press Send there to deliver your message. If it does not open, email support@veloratv.app directly.';
});
