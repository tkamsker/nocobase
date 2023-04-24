import { ArrayTable } from '@formily/antd';
import { observer } from '@formily/react';
import { useField } from '@formily/react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SchemaComponent } from '../../';

export const KanbanOptions = observer((props: any) => {
  const { groupField, collectionFields, getAssociateResource, columns } = props;
  const { t } = useTranslation();
  const optionField = useField();
  useEffect(() => {
    if (groupField) {
      const field = collectionFields.find((v) => {
        return v.name === groupField[0];
      });
      if (['select', 'radioGroup'].includes(field.interface)) {
        const data = field.uiSchema.enum.map((v) => {
          return {
            ...v,
          };
        });
        const result = data.map((v) => {
          const option = columns?.find((k) => k.value === v.value);
          if (option) {
            return { ...option };
          } else {
            return { ...v, enabled: true };
          }
        });
        optionField.form.setValuesIn('options', result);
      } else {
        const resource = getAssociateResource(field.target);
        resource.list({ paginate: false }).then(({ data }) => {
          const optionsData = data?.data.map((v) => {
            return {
              ...v,
              value: v[groupField[1]],
              label: v[groupField[1]],
            };
          });
          const result = optionsData.map((v) => {
            const option = columns?.find((k) => k.value === v.value);
            if (option) {
              return { ...option };
            } else {
              return { ...v, enabled: true };
            }
          });
          optionField.form.setValuesIn('options', result);
        });
      }
    }
  }, [groupField]);
  return (
    groupField &&
    optionField.form.values?.options?.length > 0 && (
      <>
        <div className="ant-formily-item-label">
          <div className="ant-formily-item-label-content">
            <span>
              <label>{t('Options')}</label>
            </span>
          </div>
          <span className="ant-formily-item-colon">:</span>
        </div>
        <SchemaComponent
          components={{ ArrayTable }}
          schema={{
            type: 'object',
            properties: {
              options: {
                type: 'array',
                'x-component': 'ArrayTable',
                'x-decorator': 'FormItem',
                'x-component-props': {
                  accordion: true,
                },
                items: {
                  type: 'object',
                  properties: {
                    column1: {
                      type: 'void',
                      'x-component': 'ArrayTable.Column',
                      'x-component-props': { width: 50, title: 'Sort', align: 'center' },
                      properties: {
                        sort: {
                          type: 'void',
                          'x-component': 'ArrayTable.SortHandle',
                        },
                      },
                    },
                    column2: {
                      type: 'void',
                      'x-component': 'ArrayTable.Column',
                      'x-component-props': { width: 200, title: 'Label' },
                      'x-readOnly': true,
                      properties: {
                        label: {
                          type: 'string',
                          'x-decorator': 'FormItem',
                          'x-component': 'Input',
                          'x-pattern': 'readPretty',
                        },
                      },
                    },
                    column3: {
                      type: 'void',
                      'x-component': 'ArrayTable.Column',
                      'x-hidden': true,
                      properties: {
                        value: {
                          type: 'string',
                          'x-readOnly': true,
                          'x-decorator': 'FormItem',
                          'x-component': 'Input',
                        },
                      },
                    },
                    column4: {
                      type: 'void',
                      'x-component': 'ArrayTable.Column',
                      'x-component-props': { width: 200, title: 'Color' },
                      properties: {
                        color: {
                          type: 'string',
                          'x-decorator': 'FormItem',
                          'x-component': 'ColorSelect',
                        },
                      },
                    },
                    column5: {
                      type: 'void',
                      'x-component': 'ArrayTable.Column',
                      'x-component-props': { width: 200, title: 'Enabled', align: 'center' },
                      properties: {
                        enabled: {
                          type: 'string',
                          'x-decorator': 'FormItem',
                          'x-component': 'Checkbox',
                          default: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          }}
        />
      </>
    )
  );
});
