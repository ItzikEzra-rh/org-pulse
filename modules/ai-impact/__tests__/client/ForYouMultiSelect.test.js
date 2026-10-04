import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ForYouMultiSelect from '../../client/components/ForYouMultiSelect.vue';

const OPTIONS = [
  { value: 'alice', label: 'Alice Smith' },
  { value: 'bob', label: 'Bob Jones' },
  { value: 'carol', label: 'Carol White' }
];

function openDropdown(wrapper) {
  return wrapper.find('button').trigger('click');
}

describe('ForYouMultiSelect search', () => {
  it('empty search shows the full option list', async () => {
    const wrapper = mount(ForYouMultiSelect, { props: { options: OPTIONS } });
    await openDropdown(wrapper);
    expect(wrapper.findAll('label').length).toBe(OPTIONS.length);
  });

  it('filters options case-insensitively by substring', async () => {
    const wrapper = mount(ForYouMultiSelect, { props: { options: OPTIONS } });
    await openDropdown(wrapper);
    await wrapper.find('input[type="text"]').setValue('bob');
    const labels = wrapper.findAll('label').map(l => l.text());
    expect(labels).toEqual(['Bob Jones']);
  });

  it('shows a no-results state when nothing matches', async () => {
    const wrapper = mount(ForYouMultiSelect, { props: { options: OPTIONS } });
    await openDropdown(wrapper);
    await wrapper.find('input[type="text"]').setValue('zzz');
    expect(wrapper.findAll('label').length).toBe(0);
    expect(wrapper.text()).toContain('No matches for "zzz"');
  });

  it('does not alter selected values when search hides them', async () => {
    const wrapper = mount(ForYouMultiSelect, { props: { options: OPTIONS, modelValue: ['alice'] } });
    await openDropdown(wrapper);
    await wrapper.find('input[type="text"]').setValue('bob');
    // Alice is hidden by the search text but must remain selected.
    expect(wrapper.props('modelValue')).toEqual(['alice']);
    await wrapper.find('input[type="text"]').setValue('');
    const aliceCheckbox = wrapper.findAll('label').find(l => l.text() === 'Alice Smith').find('input[type="checkbox"]');
    expect(aliceCheckbox.element.checked).toBe(true);
  });
});

describe('ForYouMultiSelect "Me" shortcut', () => {
  it('hides the shortcut when no meOption is provided', async () => {
    const wrapper = mount(ForYouMultiSelect, { props: { options: OPTIONS } });
    await openDropdown(wrapper);
    expect(wrapper.text()).not.toContain('Assigned to me');
  });

  it('clicking the shortcut sets modelValue to only meOption.value', async () => {
    const wrapper = mount(ForYouMultiSelect, {
      props: { options: OPTIONS, modelValue: ['bob'], meOption: { value: 'alice', label: 'Assigned to me' } }
    });
    await openDropdown(wrapper);
    const meButton = wrapper.findAll('button').find(b => b.text() === 'Assigned to me');
    await meButton.trigger('click');
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([['alice']]);
  });
});
