'use strict';

// Wrap everything in an anonymous function to avoid polluting the global namespace
(function () {
  // Webhook URL with CORS proxy
  const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';
  const RETOOL_WEBHOOK_URL = 'https://api.retool.com/v1/workflows/0b47dc9f-a14a-447f-a177-37d8150bb478/startTrigger';
  const RETOOL_API_KEY = 'retool_wk_27d82ecb33f64316ba0452377738a991';

  // Use the jQuery document ready signal to know when everything has been initialized
  $(document).ready(function () {
    // Tell Tableau we'd like to initialize our extension
    tableau.extensions.initializeAsync().then(function () {
      // Fetch the saved sheet name from settings. This will be undefined if there isn't one configured yet
      const savedSheetName = tableau.extensions.settings.get('sheet');
      if (savedSheetName) {
        // We have a saved sheet name, show its selected marks
        loadSelectedMarks(savedSheetName);
      } else {
        // If there isn't a sheet saved in settings, show the dialog
        showChooseSheetDialog();
      }

      initializeButtons();
    });
  });

  /**
     * Shows the choose sheet UI. Once a sheet is selected, the data table for the sheet is shown
     */
  function showChooseSheetDialog () {
    // Clear out the existing list of sheets
    $('#choose_sheet_buttons').empty();

    // Set the dashboard's name in the title
    const dashboardName = tableau.extensions.dashboardContent.dashboard.name;
    $('#choose_sheet_title').text(dashboardName);

    // The first step in choosing a sheet will be asking Tableau what sheets are available
    const worksheets = tableau.extensions.dashboardContent.dashboard.worksheets;

    // Next, we loop through all of these worksheets and add buttons for each one
    worksheets.forEach(function (worksheet) {
      // Declare our new button which contains the sheet name
      const button = createButton(worksheet.name);

      // Create an event handler for when this button is clicked
      button.click(function () {
        // Get the worksheet name and save it to settings.
        filteredColumns = [];
        const worksheetName = worksheet.name;
        tableau.extensions.settings.set('sheet', worksheetName);
        tableau.extensions.settings.saveAsync().then(function () {
          // Once the save has completed, close the dialog and show the data table for this worksheet
          $('#choose_sheet_dialog').modal('toggle');
          loadSelectedMarks(worksheetName);
        });
      });

      // Add our button to the list of worksheets to choose from
      $('#choose_sheet_buttons').append(button);
    });

    // Show the dialog
    $('#choose_sheet_dialog').modal('toggle');
  }

  function createButton (buttonTitle) {
    const button =
            $(`<button type='button' class='btn btn-default btn-block'>
      ${buttonTitle}
    </button>`);

    return button;
  }

  // This variable will save off the function we can call to unregister listening to marks-selected events
  let unregisterEventHandlerFunction;

  function loadSelectedMarks (worksheetName) {
    // Remove any existing event listeners
    if (unregisterEventHandlerFunction) {
      unregisterEventHandlerFunction();
    }

    // Get the worksheet object we want to get the selected marks for
    const worksheet = getSelectedSheet(worksheetName);

    // Set our title to an appropriate value
    $('#selected_marks_title').text(worksheet.name);

    // Call to get the selected marks for our sheet
    worksheet.getSelectedMarksAsync().then(function (marks) {
      // Get the first DataTable for our selected marks (usually there is just one)
      const worksheetData = marks.data[0];

      // Map our data into the format which the data table component expects it
      const data = worksheetData.data.map(function (row, index) {
        const rowData = row.map(function (cell) {
          return cell.formattedValue;
        });

        return rowData;
      });

      const columns = worksheetData.columns.map(function (column) {
        return {
          title: column.fieldName
        };
      });

      // Populate the data table with the rows and columns we just pulled out
      populateDataTable(data, columns);
    });

    // Add an event listener for the selection changed event on this sheet.
    unregisterEventHandlerFunction = worksheet.addEventListener(tableau.TableauEventType.MarkSelectionChanged, function (selectionEvent) {
      // When the selection changes, reload the data
      loadSelectedMarks(worksheetName);
    });
  }

  function populateDataTable (data, columns) {
    // Do some UI setup here: change the visible section and reinitialize the table
    $('#data_table_wrapper').empty();

    if (data.length > 0) {
      $('#no_data_message').css('display', 'none');
      $('#data_table_wrapper').append('<table id=\'data_table\' class=\'table table-striped table-bordered\'></table>');

      // Do some math to compute the height we want the data table to be
      const top = $('#data_table_wrapper')[0].getBoundingClientRect().top;
      const height = $(document).height() - top - 130;

      const headerCallback = function (thead, data) {
        const headers = $(thead).find('th');
        for (let i = 0; i < headers.length; i++) {
          const header = $(headers[i]);
          if (header.children().length === 0) {
            const fieldName = header.text();
            const button = $(`<a href='#'>${fieldName}</a>`);
            button.click(function () {
              filterByColumn(i, fieldName);
            });

            header.html(button);
          }
        }
      };

      // Initialize our data table with what we just gathered
      $('#data_table').DataTable({
        data: data,
        columns: columns,
        autoWidth: false,
        deferRender: true,
        scroller: true,
        scrollY: height,
        scrollX: true,
        headerCallback: headerCallback,
        dom: "<'row'<'col-sm-6'i><'col-sm-6'f>><'row'<'col-sm-12'tr>>" // Do some custom styling
      });
    } else {
      // If we didn't get any rows back, there must be no marks selected
      $('#no_data_message').css('display', 'inline');
    }
  }

  function initializeButtons () {
    $('#show_choose_sheet_button').click(showChooseSheetDialog);
    $('#reset_filters_button').click(resetFilters);
    $('#send_to_retool_button').click(sendToRetool);
  }

  // Save the columns we've applied filters to so we can reset them
  let filteredColumns = [];

  function filterByColumn (columnIndex, fieldName) {
    // Grab our column of data from the data table and filter out to just unique values
    const dataTable = $('#data_table').DataTable({
      retrieve: true
    });
    const column = dataTable.column(columnIndex);
    const columnDomain = column.data().toArray().filter(function (value, index, self) {
      return self.indexOf(value) === index;
    });

    const worksheet = getSelectedSheet(tableau.extensions.settings.get('sheet'));
    worksheet.applyFilterAsync(fieldName, columnDomain, tableau.FilterUpdateType.Replace);
    filteredColumns.push(fieldName);
    return false;
  }

  function resetFilters () {
    const worksheet = getSelectedSheet(tableau.extensions.settings.get('sheet'));
    filteredColumns.forEach(function (columnName) {
      worksheet.clearFilterAsync(columnName);
    });

    filteredColumns = [];
  }

  function getSelectedSheet (worksheetName) {
    if (!worksheetName) {
      worksheetName = tableau.extensions.settings.get('sheet');
    }

    // Go through all the worksheets in the dashboard and find the one we want
    return tableau.extensions.dashboardContent.dashboard.worksheets.find(function (sheet) {
      return sheet.name === worksheetName;
    });
  }

  function showMessage(message, isSuccess) {
    const messageArea = $('#message_area');
    messageArea.removeClass('success error');
    messageArea.addClass(isSuccess ? 'success' : 'error');
    messageArea.text(message);
    messageArea.show();
    
    // Hide message after 5 seconds
    setTimeout(() => {
      messageArea.hide();
    }, 5000);
  }

  function sendXHR(url, apiKey, data) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('X-Workflow-Api-Key', apiKey);
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
        } else {
          let errorMessage = `HTTP error! status: ${xhr.status}`;
          if (xhr.status === 401) {
            errorMessage = 'Authentication failed. Please check your Retool API key.';
          }
          reject(new Error(errorMessage));
        }
      };
      
      xhr.onerror = () => {
        reject(new Error('Network error occurred while sending data to Retool'));
      };
      
      xhr.send(JSON.stringify(data));
    });
  }

  async function sendToRetool() {
    try {
      const worksheetName = tableau.extensions.settings.get('sheet');
      if (!worksheetName) {
        showMessage('Please select a worksheet first', false);
        return;
      }

      const worksheet = getSelectedSheet(worksheetName);
      const marks = await worksheet.getSelectedMarksAsync();
      
      if (!marks.data || marks.data.length === 0) {
        showMessage('No marks selected', false);
        return;
      }

      const worksheetData = marks.data[0];
      const data = worksheetData.data.map(row => {
        const rowData = {};
        worksheetData.columns.forEach((column, index) => {
          rowData[column.fieldName] = row[index].formattedValue;
        });
        return rowData;
      });

      const payload = {
        worksheet: worksheetName,
        data: data.slice(0, 1) // Send just one record for testing
      };

      // Get the current origin
      const currentOrigin = window.location.origin;
      console.log('Current origin:', currentOrigin);

      console.log('Sending data to Retool:', {
        url: RETOOL_WEBHOOK_URL,
        origin: currentOrigin,
        method: 'POST',
        payload: JSON.stringify(payload)
      });

      const xhr = new XMLHttpRequest();
      xhr.open('POST', RETOOL_WEBHOOK_URL);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('X-Workflow-Api-Key', RETOOL_API_KEY);
      xhr.setRequestHeader('Origin', currentOrigin);

      xhr.onload = function() {
        console.log('XHR Response Headers:', xhr.getAllResponseHeaders());
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log('XHR Response:', xhr.responseText);
          showMessage('Data sent to Retool successfully', true);
        } else {
          console.error('XHR Error:', xhr.status, xhr.statusText);
          showMessage(`Error: ${xhr.status} - ${xhr.statusText}`, false);
        }
      };

      xhr.onerror = function() {
        console.error('Network error occurred');
        showMessage('Network error occurred while sending data to Retool', false);
      };

      xhr.send(JSON.stringify(payload));
    } catch (error) {
      console.error('Error in sendToRetool:', error);
      showMessage(`Error: ${error.message}`, false);
    }
  }
})();
