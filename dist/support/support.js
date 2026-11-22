const form = document.querySelector('#feedback-form');
const fields = [...form.querySelectorAll('input[required], textarea[required]')];
fields.forEach(field => {
  field.addEventListener('input', () => {
    field.setCustomValidity(field.value.trim() ? '' : 'Please enter a title or description.');
  });
});
form.addEventListener('submit', event => {
  fields.forEach(field => field.setCustomValidity(field.value.trim() ? '' : 'Please enter a title or description.'));
  if (!form.reportValidity()) event.preventDefault();
});
